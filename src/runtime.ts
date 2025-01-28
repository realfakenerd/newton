import {
	DIRTY,
	MAYBE_DIRTY,
	CLEAN,
	DESTROYED,
	INERT,
	UNOWNED,
	DISCONNECTED,
	BLOCK_EFFECT,
	BRANCH_EFFECT,
	ROOT_EFFECT,
	DERIVED,
	RENDER_EFFECT,
	EFFECT,
} from "./constants";
import { destroyEffectDeriveds, executeEffectTeardown } from "./effect";
import type { Derived, Effect, EffectFn, Reaction, Value } from "./types";
import { indexOf } from "./utils";

const FLUSH_MICROTASK = 0;
const FLUSH_SYNC = 1;

let schedulerMode = FLUSH_MICROTASK;
let isMicroTaskQueued = false;
let lastScheduledEffect: Effect | null = null;
let isFlushingEffect = false;
let queuedRootEffects: Effect[] = [];
let flushCount = 0;
let readVersion = 0;

export let skipReaction = false;
export let activeEffect: Effect | null = null;
export let newDeps: Value[] | null = null;
export let untracking = false;
export let isDestroyingEffect = false;
export let activeReaction: Reaction | null = null;

let skippedDeps = 0;
let untrackedWrites: Value[] | null = null;
let derivedSources: Value[] | null = null;

const STATUS_MASK = ~(DIRTY | MAYBE_DIRTY | CLEAN);
let writeVersion = 1;

export function setIsFlushingEffect(value: boolean) {
	isFlushingEffect = value;
}

export function setIsDestroyingEffect(value: boolean) {
	isDestroyingEffect = value;
}

export function setActiveEffect(effect: Effect | null) {
	activeEffect = effect;
}

export function setActiveReaction(reaction: Reaction | null) {
	activeReaction = reaction;
}

export function setDerivedSources(sources: Value[] | null) {
	derivedSources = sources;
}

export function setUntrackedWrites(writes: Value[] | null) {
	untrackedWrites = writes;
}

export function setSignalStatus(reaction: Reaction, status: number) {
	reaction.f = (reaction.f & STATUS_MASK) | status;
}

export function incrementWriteVersion() {
	return writeVersion++;
}

function infiniteLoopGuard() {
	if (flushCount > 1000) {
		flushCount = 0;
		throw new Error("Maximum update depth exceeded.");
	}

	flushCount++;
}

function checkDirtiness(reaction: Reaction) {
	const flags = reaction.f;
	if ((flags & DIRTY) !== 0) {
		return true;
	}

	if ((flags & MAYBE_DIRTY) !== 0) {
		const dependencies = reaction.deps;
		const isUnowned = (flags & UNOWNED) !== 0;

		if (dependencies !== null) {
			let i: number;
			let dependency: Value | null;
			const isDisconected = (flags & DISCONNECTED) !== 0;
			const isUnownedConnected =
				isUnowned && activeEffect !== null && !skipReaction;
			const length = dependencies.length;

			if (isDisconected || isUnownedConnected) {
				for (i = 0; i < length; i++) {
					dependency = dependencies[i];

					if (isDisconected || !dependency.reactions?.includes(reaction)) {
						dependency.reactions ??= [];
						dependency.reactions.push(reaction);
					}
				}

				if (isDisconected) {
					reaction.f ^= DISCONNECTED;
				}
			}

			for (i = 0; i < length; i++) {
				dependency = dependencies[i];
				if (checkDirtiness(dependency as Derived)) {
					// updatedDerived(dependency as Derived);
				}

				if (dependency.wv > reaction.wv) {
					return true;
				}
			}
		}

		if (isUnowned || (activeEffect !== null && !skipReaction)) {
			setSignalStatus(reaction, CLEAN);
		}
	}
	return false;
}

function processEffects(effect: Effect, collectedEffects: Effect[]) {
	let currentEffect = effect.first;
	const effects: Effect[] = [];

	mainloop: while (currentEffect !== null) {
		const flags = currentEffect.f;
		const isBranch = (flags & BRANCH_EFFECT) !== 0;
		const isSkippableBranch = isBranch && (flags & CLEAN) !== 0;
		const sibling = currentEffect.next;

		if (!isSkippableBranch && (flags & INERT) === 0) {
			if ((flags & RENDER_EFFECT) !== 0) {
				if (isBranch) {
					currentEffect.f ^= CLEAN;
				} else {
					if (checkDirtiness(currentEffect)) {
						updateEffect(currentEffect);
					}
				}

				const child = currentEffect.first;
				if (child !== null) {
					currentEffect = child;
				}
			} else if ((flags & EFFECT) !== 0) {
				effects.push(currentEffect);
			}
		}

		if (sibling === null) {
			let parent = currentEffect.parent;
			while (parent !== null) {
				if (effect === parent) {
					break mainloop;
				}
				const parentSibling = parent.next;
				if (parentSibling === null) {
					currentEffect = parentSibling;
					continue mainloop;
				}
				parent = parent.parent;
			}
		}
		currentEffect = sibling;
	}

	for (let i = 0; i < effects.length; i++) {
		const child = effects[i];
		collectedEffects.push(child);
		processEffects(child, collectedEffects);
	}
}

function flushQueuedEffects(effects: Effect[]) {
	const length = effects.length;
	if (length === 0) return;
	for (let i = 0; i < length; i++) {
		const effect = effects[i];
		if ((effect.f & (DESTROYED | INERT)) === 0) {
			try {
				if (checkDirtiness(effect)) {
					updateEffect(effect);
				}
			} catch (error) {
				// handleError(error, effect);
			}
		}
	}
}

function flushQueuedRootEffects(rootEffects: Effect[]) {
	const length = rootEffects.length;
	if (length === 0) return;

	infiniteLoopGuard();

	const previouslyFlushingEffect = isFlushingEffect;
	isFlushingEffect = true;
	try {
		for (let i = 0; i < length; i++) {
			const effect = rootEffects[i];
			if ((effect.f & CLEAN) === 0) {
				effect.f ^= CLEAN;
			}

			const collectedEffects: Effect[] = [];
			processEffects(effect, collectedEffects);
			flushQueuedEffects(collectedEffects);
		}
	} finally {
		isFlushingEffect = previouslyFlushingEffect;
	}
}

function removeReaction<V>(signal: Reaction, depedency: Value<V>) {
	let reactions = depedency.reactions;
	if (reactions !== null) {
		const index = indexOf.call(reactions, signal);
		if (index !== -1) {
			const newLength = reactions.length - 1;
			if (newLength === 0) {
				reactions = depedency.reactions = null;
			} else {
				reactions[index] = reactions[newLength];
				reactions.pop();
			}
		}
	}

	if (
		reactions === null &&
		(depedency.f & DERIVED) !== 0 &&
		(newDeps === null || !newDeps.includes(depedency as Value))
	) {
		setSignalStatus(depedency as Derived, MAYBE_DIRTY);

		if ((depedency.f & (UNOWNED | DISCONNECTED)) === 0) {
			depedency.f ^= DISCONNECTED;
		}

		removeReactions(depedency as Derived, 0);
	}
}

export function removeReactions(signal: Reaction, startIndex: number) {
	const dependencies = signal.deps;
	if (dependencies === null) return;

	for (let i = startIndex; i < dependencies.length; i++) {
		removeReaction(signal, dependencies[i]);
	}
}

export function updateReaction(reaction: Reaction) {
	const previousDeps = newDeps;
	const previousSkippedDeps = skippedDeps;
	const previousUntrackedWrites = untrackedWrites;
	const previousReaction = activeReaction;
	const previousSkipReaction = skipReaction;
	const previousDerivedSources = derivedSources;
	const previousUntracked = untracking;
	const flags = reaction.f;

	newDeps = null;
	skippedDeps = 0;
	untrackedWrites = null;
	activeReaction =
		(flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
	skipReaction = !isFlushingEffect && (flags & UNOWNED) !== 0;
	derivedSources = null;
	untracking = false;
	readVersion++;

	try {
		let result: EffectFn;
		if (reaction.fn) {
			result = reaction.fn() as unknown as EffectFn;
		}

		const deps = reaction.deps;

		if (newDeps !== null) {
			let i: number;

			removeReactions(reaction, skippedDeps);

			if (deps !== null && skippedDeps > 0) {
				deps.length = skippedDeps + (newDeps as Value[]).length;
				for (i = 0; i < (newDeps as Value[]).length; i++) {
					deps[skippedDeps + i] = newDeps[i];
				}
			} else {
				reaction.deps = newDeps;
			}

			if (!skipReaction && deps !== null) {
				for (i = skippedDeps; i < deps.length; i++) {
					if (deps[i].reactions === null) {
						deps[i].reactions = [];
					}
					deps[i].reactions?.push(reaction);
				}
			}
		} else if (deps !== null && skippedDeps < deps.length) {
			removeReactions(reaction, skippedDeps);
			deps.length = skippedDeps;
		}

		if (previousReaction !== null) {
			readVersion++;
		}
	} finally {
		newDeps = previousDeps;
		skippedDeps = previousSkippedDeps;
		untrackedWrites = previousUntrackedWrites;
		activeReaction = previousReaction;
		skipReaction = previousSkipReaction;
		derivedSources = previousDerivedSources;
		untracking = previousUntracked;
	}
}

function updateEffect(effect: Effect) {
	const flags = effect.f;

	if ((flags & DESTROYED) !== 0) {
		return;
	}

	setSignalStatus(effect, CLEAN);

	const previousEffect = activeEffect;

	activeEffect = effect;

	try {
		destroyEffectDeriveds(effect);

		executeEffectTeardown(effect);

		const teardown = updateReaction(effect);
		effect.teardown = typeof teardown === "function" ? teardown : null;
		effect.wv = writeVersion;
	} finally {
		activeEffect = previousEffect;
	}
}

function processDefered() {
	isMicroTaskQueued = false;
	if (flushCount > 1001) {
		return;
	}

	const previousQueuedRootEffects = queuedRootEffects;
	queuedRootEffects = [];
	flushQueuedRootEffects(previousQueuedRootEffects);
	if (!isMicroTaskQueued) {
		flushCount = 0;
		lastScheduledEffect = null;
	}
}

export function scheduleEffect(signal: Reaction) {
	if (schedulerMode === FLUSH_MICROTASK) {
		if (!isMicroTaskQueued) {
			isMicroTaskQueued = true;
			queueMicrotask(processDefered);
		}
	}

	lastScheduledEffect = signal as Effect;
	let effect = signal as Effect;

	while (effect.parent !== null) {
		effect = effect.parent;
		const flags = effect.f;
		if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
			if ((flags & CLEAN) !== 0) return;
			effect.f ^= CLEAN;
		}
	}
}
