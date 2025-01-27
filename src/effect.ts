import { CLEAN } from "./constants.js";
import type { DerivedValue, EffectFn, Reaction } from "./types.js";

export let activeEffect: DerivedValue | null = null;
export const effectStack: DerivedValue[] = [];

export function setActiveEffect(effect: DerivedValue | null) {
	activeEffect = effect;
}

export function effect(fn: EffectFn) {
	const reaction: DerivedValue = {
		flags: CLEAN,
		fn,
		deps: null,
		writeVersion: 0,
		readVersion: 0,
		reactions: null,
		value: undefined,
		equals: () => true,
		computeCount: 0,
		lastComputedTime: 0,
		cacheThreshold: 0,
		parent: null,
		children: null
	};

	const execute = async () => {
		effectStack.push(reaction);
		activeEffect = reaction;

		try {
			await fn();
		} finally {
			activeEffect = effectStack.pop() ?? null;
		}
	};

	Promise.resolve(execute());

	// Retorna uma função de cleanup
	return () => {
		reaction.fn = null;
		reaction.deps = null;
	};
}
