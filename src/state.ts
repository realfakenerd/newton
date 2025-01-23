import { batchDepth, batchQueue } from "./batch.js";
import { activeEffect } from "./effect.js";
import { ReactiveMap, ReactiveSet } from "./iterators.js";
import { STATE_SYMBOL, UNINITIALIZED } from "./symbols.js";
import type { Equals, Reaction, Value } from "./types.js";

export class Source<T> implements Value<T> {
	f = 0; // Flags bitmask for internal state tracking
	wv = 0; // Write version - incremented on value change
	rv = 0; // Read version - used to detect stale reads
	reactions: Reaction[] | null = null; // List of reactions to notify on change

	constructor(
		public v: T, // Current value
		public equals: Equals<T> = Object.is,
	) { }

	get() {
		if (activeEffect) {
			if (!this.reactions) {
				this.reactions = [];
			}

			if (!this.reactions.includes(activeEffect)) {
				this.reactions.push(activeEffect);
			}
		}

		return this.v;
	}

	set(newValue: T) {
		if (!this.equals(this.v, newValue)) {
			this.v = newValue;
			this.wv++;

			this.#notify();
		}
	}

	#notify() {
		if (this.reactions) {
			if (batchDepth > 0) {
				batchQueue.add(this as Value);
				return;
			}

			const reactions = Array.from(this.reactions);
			for (const reaction of reactions) {
				if (reaction.fn) {
					try {
						reaction.fn();
					} catch (error) {
						console.error("Effect Error:", error);
					}
				}
			}
		}
	}
}

function createProxy<T>(target: T) {
	if (!target || typeof target !== "object" || STATE_SYMBOL in target) {
		return target;
	}

	if (target instanceof Map) {
		return new ReactiveMap(target.entries()) as unknown as T;
	}

	if (target instanceof Set) {
		return new ReactiveSet(target.values()) as unknown as T;
	}

	const sources = new Map<string | symbol, Source<any>>();

	if (Array.isArray(target)) {
		// Create 'length' source eagerly for arrays
		sources.set("length", new Source((target as unknown[]).length));
	}

	return new Proxy(target, {
		get(target, prop, receiver) {
			if (prop === STATE_SYMBOL) return target;

			let source = sources.get(prop);
			const exists = prop in target;

			if (
				!source &&
				(!exists || Object.getOwnPropertyDescriptor(target, prop)?.writable)
			) {
				source = new Source(
					createProxy(
						exists
							? (target as Record<string, unknown>)[prop as string]
							: UNINITIALIZED,
					),
				);
				sources.set(prop as string, source);
			}

			if (source) {
				const value = source.get();
				return value === UNINITIALIZED ? undefined : value;
			}

			return Reflect.get(target, prop, receiver);
		},
		set(target, prop, value) {
			let source = sources.get(prop as string);
			const has = prop in target;

			if (
				!source &&
				(!has || Object.getOwnPropertyDescriptor(target, prop)?.writable)
			) {
				source = new Source(undefined);
				sources.set(prop, source);
			}

			if (source) {
				source.set(createProxy(value));
			}

			if (Array.isArray(target) && prop === "length") {
				for (let i = value; i < source?.v; i++) {
					let otherSource = sources.get(i);
					if (otherSource !== undefined) {
						otherSource.set(undefined);
					} else if (i in target) {
						otherSource = new Source(UNINITIALIZED);
						sources.set(i, otherSource)
					}
				}
			}

			return true;
		},
	});
}

export function state<T>(obj: T) {
	return createProxy(obj) as T;
}
