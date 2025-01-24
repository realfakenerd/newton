import { CLEAN } from "./constants.js";
import type { EffectFn, Reaction } from "./types.js";

export let activeEffect: Reaction | null = null;
export const effectStack: Reaction[] = [];

export function setActiveEffect(effect: Reaction | null) {
	activeEffect = effect;
}

export function effect(fn: EffectFn) {
	const reaction: Reaction = {
		f: CLEAN,
		fn,
		deps: null,
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
