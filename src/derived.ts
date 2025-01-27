import { batchDepth } from "./batch.js";
import { activeEffect, setActiveEffect } from "./effect.js";
import { UNINITIALIZED } from "./symbols.js";
import type { DerivedValue, Equals, Reaction, Value } from "./types.js";

const enum Flags {
	DIRTY = 1 << 0,
	RUNNING = 1 << 1,
	ASYNC = 1 << 2,
	INITIALIZED = 1 << 3,
	HAS_ERROR = 1 << 4,
	UNOWNED = 1 << 5,
	DERIVED = 1 << 6,
}

type DerivedFn<T> = () => T;

const derivedCache = new WeakMap<DerivedFn<any>, WeakRef<Derived<any>>>();

function createDerived<T>(fn: () => T, equals: Equals<T> = Object.is) {
	let flags = Flags.DERIVED | Flags.DIRTY;

	if (!activeEffect) {
		flags |= Flags.UNOWNED;
	}

	const derived = {
		flags,
		writeVersion: 0,
		readVersion: 0,
		reactions: null,
		deps: null,
		value: UNINITIALIZED as T,
		fn,
		equals,
		computeCount: 0,
		lastComputedTime: 0,
		cacheThreshold: 100,
		parent: null as DerivedValue<any> | null,
		children: null as DerivedValue<any>[] | null,
	} satisfies DerivedValue<T>;

	const parentDerived =
		activeEffect && activeEffect.flags & Flags.DERIVED
			? (activeEffect as DerivedValue<any>)
			: null;

	if (parentDerived) {
		derived.parent = parentDerived;
		if (!parentDerived.children) {
			parentDerived.children = [];
		}
		parentDerived.children.push(derived);
	}

	return derived;
}

function notifyReactions(derived: DerivedValue) {
	if (!derived.reactions) return;
	for (const reaction of derived.reactions) {
		if (reaction.fn) {
			try {
				reaction.fn();
			} catch (error) {
				console.error("Reaction Error:", error);
			}
		}
	}
}

function handleDependencyChange(derived: DerivedValue) {
	if (!(derived.flags & Flags.DIRTY)) {
		derived.flags |= Flags.DIRTY;
		derived.writeVersion++;
	}

	if (derived.reactions && batchDepth === 0) {
		notifyReactions(derived);
	}
}

function collectDependencies(derived: DerivedValue) {
	if (derived.deps) {
		for (const dep of derived.deps) {
			if (dep.reactions) {
				const index = dep.reactions.findIndex(
					(r) => r.fn === handleDependencyChange.bind(null, derived),
				);

				if (index !== -1) {
					dep.reactions.splice(index, 1);
				}
			}
		}
	}
	derived.deps = [];
}

function compute<T>(derived: DerivedValue<T>): T {
	if (derived.flags & Flags.RUNNING) {
		throw new Error("Circular dependency detected");
	}

	derived.flags |= Flags.RUNNING;
	const start = performance.now();
	const prevEffect = activeEffect;

	const reaction: Reaction = {
		flags: 0,
		fn: () => handleDependencyChange(derived),
		deps: null,
	};

	setActiveEffect(reaction);
	collectDependencies(derived);

	try {
		const value = derived.fn();
		const computeTime = performance.now() - start;

		updateComputationStats(derived, computeTime);

		if (!derived.equals(derived.value, value)) {
			derived.value = value;
			derived.writeVersion++;
		}

		derived.flags &= ~Flags.DIRTY;
		derived.flags |= Flags.INITIALIZED;

		return value;
	} finally {
		derived.flags &= ~Flags.RUNNING;
		setActiveEffect(prevEffect);
	}
}

function updateComputationStats(
	derived: DerivedValue<any>,
	computeTime: number,
) {
	derived.computeCount++;
	if (derived.computeCount > 10) {
		derived.cacheThreshold = Math.max(50, computeTime * 2);
	}
	derived.lastComputedTime = Date.now();
}

function getDerivedValue<T>(derived: DerivedValue<T>): T {
	derived.readVersion++;

	if (activeEffect) {
		if (!derived.reactions) {
			derived.reactions = [];
		}
		if (!derived.reactions.includes(activeEffect)) {
			derived.reactions.push(activeEffect);
		}
	}

	if (
		derived.flags & Flags.DIRTY &&
		Date.now() - derived.lastComputedTime > derived.cacheThreshold
	) {
		compute(derived);
	}

	return derived.value;
}

export function derived<T>(fn: () => T, equals: Equals<T> = Object.is) {
	let cachedDerived = derivedCache.get(fn)?.deref() as DerivedValue<T>;

	if (!cachedDerived) {
		cachedDerived = createDerived(fn, equals);
		derivedCache.set(fn, new WeakRef(cachedDerived));
	}

	// Proxy para manter a API pública limpa e consistente
	return new Proxy(cachedDerived, {
		get(target, prop) {
			if (
				prop === "value" ||
				prop === Symbol.toPrimitive ||
				prop === "valueOf"
			) {
				return getDerivedValue(target);
			}
			return Reflect.get(target, prop);
		},
	});
}
