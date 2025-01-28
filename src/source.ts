import { CLEAN, DERIVED, DIRTY, MAYBE_DIRTY, UNOWNED } from "./constants";
import { activeEffect } from "./effect";
import { safeEquals } from "./equality";
import { incrementWriteVersion, scheduleEffect, setSignalStatus } from "./runtime";
import type { Derived, Value } from "./types";

/**
 * Creates a signal with the given initial value.
 *
 * @remarks
 * The `source` function creates a signal that is not derived from any other signal.
 * The signal is clean, meaning it does not depend on any other signal.
 *
 * @param v The initial value of the signal.
 * @returns A signal with the given initial value.
 */
export function source<T>(v: T) {
	const signal: Value<T> = {
		f: 0,
		v,
		reactions: null,
		equals: Object.is,
		rv: 0,
		wv: 0,
	};

	return signal;
}


/**
 * Marks all reactions of the given signal as dirty, maybe dirty or clean.
 *
 * @remarks
 * If the signal is derived, the function will recursively mark its dependencies.
 * If the signal is not derived, the function will schedule the effect to run.
 *
 * @param signal The signal whose reactions should be marked.
 * @param status The status to set on the reactions. Can be either `DIRTY`, `MAYBE_DIRTY` or `CLEAN`.
 */
export function markReactions(signal: Value<any>, status: number) {
	const reactions = signal.reactions;
	if (reactions === null) return;

	const length = reactions.length;
	for (let i = 0; i < length; i++) {
		const reaction = reactions[i];
		const flags = reaction.f;

		// skips if efect is marked as diry
		if ((flags & DIRTY) !== 0) return;

		setSignalStatus(reaction, status);

		if ((flags & (CLEAN | UNOWNED)) !== 0) {
			if ((flags & DERIVED) !== 0) {
				markReactions(reaction as unknown as Derived, MAYBE_DIRTY);
			} else {
				scheduleEffect(reaction);
			}
		}
	}
}

/**
 * Creates a signal with the given initial value.
 *
 * @remarks
 * The `mutableSource` function creates a signal that is not derived from any other signal.
 * The signal is clean, meaning it does not depend on any other signal.
 * The signal is mutable, meaning the value can be changed using the `set` function.
 * The `equals` method will be set to `safeEquals` unless the `immutable` option is set to `true`.
 *
 * @param initialValue The initial value of the signal.
 * @param immutable Set to `true` to make the signal immutable. Defaults to `false`.
 * @returns A signal with the given initial value.
 */
export function mutableSource<T>(initialValue: T, immutable = false) {
	const s = source(initialValue);
	if (!immutable) {
		s.equals = safeEquals;
	}
	return s;
}


/**
 * Sets the value of a signal.
 *
 * If the given value is not equal to the current value of the signal
 * (as determined by the `equals` method of the signal), sets the
 * value of the signal to the given value and marks all reactions
 * that depend on the signal as dirty.
 *
 * @param signal The signal to set.
 * @param value The value to set the signal to.
 * @returns The value of the signal (which may be different from the given value if the signal is immutable).
 */
export function set<T>(signal: Value<T>, value: T) {
	if (!signal.equals(value, signal.v)) {
		signal.v = value;
		signal.wv = incrementWriteVersion();

		markReactions(signal, DIRTY);
	}

	return value;
}

/**
 * Retrieves the current value of the specified signal.
 *
 * @remarks
 * If there is an active effect and the signal's reactions do not
 * include the active effect, the active effect is added to the
 * signal's reactions. This ensures that any changes to the signal
 * will trigger the active effect.
 *
 * @param signal The signal whose value is to be retrieved.
 * @returns The current value of the signal.
 */

export function get<T>(signal: Value<T>) {
	// @ts-ignore
	if (activeEffect !== null && !signal.reactions?.includes(activeEffect)) {
		signal.reactions = signal.reactions ?? [];
		// @ts-ignore
		signal.reactions.push(activeEffect);
	}

	return signal.v;
}

