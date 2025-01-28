import { CLEAN, DESTROYED, DIRTY, EFFECT, ROOT_EFFECT } from "./constants.js";
import { destroyDerived } from "./derived.js";
import {
	activeEffect,
	activeReaction,
	isDestroyingEffect,
	removeReactions,
	setActiveReaction,
	setIsDestroyingEffect,
	setSignalStatus,
} from "./runtime.js";
import type { Effect, EffectFn } from "./types.js";

export const effectStack: DerivedValue[] = [];

/**
 * Calls the teardown function associated with the given effect.
 * This function is usually called by the effect runner when an effect is
 * being destroyed.
 *
 * @param {Effect} effect - the effect to call the teardown function for
 *
 * @internal
 */
export function executeEffectTeardown(effect: Effect) {
	const teardown = effect.teardown;
	if (teardown !== null) {
		const previouslyDestroyingEffect = isDestroyingEffect;
		const previousReaction = activeReaction;

		setIsDestroyingEffect(true);
		setActiveReaction(null);

		try {
			teardown.call(null);
		} finally {
			setIsDestroyingEffect(previouslyDestroyingEffect);
			setActiveReaction(previousReaction);
		}
	}
}

export function destroyEffectDeriveds(signal: Effect) {
	const deriveds = signal.deriveds;
	if (deriveds !== null) {
		signal.deriveds = null;

		for (let i = 0; i < deriveds.length; i++) {
			destroyDerived(deriveds[i]);
		}
	}
}

export function destroyEffectChildren(signal: Effect) {
	let effect = signal.first;
	signal.first = signal.last = null;

	while (effect !== null) {
		const next = effect.next;
		destroyEffect(effect);
		effect = next;
	}
}

/**
 * Destroys an effect and all of its children. This function should be called
 * when an effect is no longer needed and should be cleaned up.
 *
 * @param {Effect} effect - the effect to destroy
 *
 * @internal
 */
export function destroyEffect(effect: Effect) {
	destroyEffectChildren(effect);
	destroyEffectDeriveds(effect);
	removeReactions(effect, 0);
	setSignalStatus(effect, DESTROYED);

	executeEffectTeardown(effect);

	const parent = effect.parent;
	if (parent !== null && parent.first !== null) {
		unlinkEffect(effect);
	}

	effect.next =
		effect.prev =
		effect.last =
		effect.first =
		effect.parent =
		effect.deriveds =
		effect.teardown =
			null;
}

export function unlinkEffect(effect: Effect) {
	const parent = effect.parent;
	const prev = effect.prev;
	const next = effect.next;

	if (prev !== null) prev.next = next;
	if (next !== null) next.prev = prev;

	if (parent !== null) {
		if (parent.first === effect) parent.first = next;
		if (parent.last === effect) parent.last = prev;
	}
}

function createEffect(type: number, fn: EffectFn, sync: boolean, push = true) {
	const isRoot = (type & ROOT_EFFECT) !== 0;
	const parentEffect = activeEffect;

	const effect: Effect = {
		deps: null,
		deriveds: null,
		f: type | DIRTY,
		first: null,
		fn,
		last: null,
		next: null,
		parent: isRoot ? null : parentEffect,
		prev: null,
		teardown: null,
		wv: 0,
	};
}

export function effect(fn: EffectFn) {
	return createEffect(EFFECT, fn, false);
}
