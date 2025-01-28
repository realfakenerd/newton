import {
	DERIVED,
	DESTROYED,
	DIRTY,
	EFFECT_HAS_DERIVED,
	UNOWNED,
} from "./constants.js";
import { destroyEffect } from "./effect.js";
import { equals } from "./equality.js";
import {
	activeEffect,
	activeReaction,
	removeReactions,
	setSignalStatus,
} from "./runtime.js";
import type { Derived, Effect, Equals } from "./types.js";

export function derived<V>(fn: () => V) {
	let flags = DERIVED | DIRTY;

	if (activeEffect === null) {
		flags |= UNOWNED;
	} else {
		activeEffect.f |= EFFECT_HAS_DERIVED;
	}

	const parentDerived =
		activeReaction !== null && (activeReaction?.f & DERIVED) !== 0
			? (activeReaction as Derived)
			: null;

	const signal: Derived<V> = {
		children: null,
		deps: null,
		equals,
		f: flags,
		fn,
		reactions: null,
		rv: 0,
		v: null as V,
		wv: 0,
		parent: (parentDerived ?? activeEffect) as Derived,
	};

	return signal;
}

function destroyDerivedChildren(derived: Derived) {
	const children = derived.children;
	if (children !== null) {
		derived.children = null;

		for (let i = 0; i < children.length; i++) {
			const child = children[i];

			if ((child.f & DERIVED) !== 0) {
				destroyDerived(child as Derived);
			} else {
				destroyEffect(child as Effect);
			}
		}
	}
}

export function destroyDerived(derived: Derived) {
	destroyDerivedChildren(derived);
	removeReactions(derived, 0);
	setSignalStatus(derived, DESTROYED);

	derived.v = derived.children = derived.deps = derived.reactions = null;
}
