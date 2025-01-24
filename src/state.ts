import { batchDepth, batchQueue } from "./batch.js";
import { CLEAN, DERIVED, DIRTY, MAYBE_DIRTY } from "./constants.js";
import { activeEffect } from "./effect.js";
import { ReactiveMap, ReactiveSet } from "./iterators.js";
import { STATE_SYMBOL, UNINITIALIZED } from "./symbols.js";
import type { Equals, Reaction, Value } from "./types.js";
import { getDescriptor, isArray } from "./utils.js";

export class Source<T> {
	#v: T; // Value
	#f = CLEAN; // Flags bitmask for internal state tracking
	#reactions: Set<Reaction>; // List of reactions to notify on change
	#reactionCount = 0;


	constructor(
		value: T,
		public equals: Equals<T> = Object.is,
	) {
		this.#v = value;
		this.#reactions = new Set();
	}

	get v() {
		return this.#v;
	}

	get() {
		if (activeEffect) {
			if (!this.#reactions.has(activeEffect)) {
				this.#reactions.add(activeEffect);
				this.#reactionCount++;
			}
		}
		return this.#v;
	}

	set(newValue: T) {
		if (this.equals(this.v, newValue)) return;
		const reactionCount = this.#reactionCount;

		this.#v = newValue;
		this.#f |= DIRTY;
		if (reactionCount === 0) return;
		this.#markReactions(reactionCount);
	}

	#markReactions(reactionCount: number) {
		if (reactionCount === 0) return;

		for (const reaction of this.#reactions) {
			if (!(reaction.f & (DIRTY | CLEAN))) {
				this.#setReactionStatus(reaction);
			}
		}
	}

	#setReactionStatus(reaction: Reaction) {
		if (!(reaction.f & (CLEAN | DIRTY))) return;

		if (reaction.f & DERIVED) {
			reaction.f |= MAYBE_DIRTY;
		} else {
			this.#scheduleEffect(reaction);
		}
	}

	#scheduleEffect(reaction: Reaction) {
		if (batchDepth > 0) {
			batchQueue.add(this as unknown as Value);
			return;
		}

		reaction.fn?.();
	}
}

function createProxy<T>(value: T) {
	if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
		return value;
	}

	if (value instanceof Map) {
		return new ReactiveMap(value.entries()) as unknown as T;
	}

	if (value instanceof Set) {
		return new ReactiveSet(value.values()) as unknown as T;
	}

	const sources = new Map<string | symbol, Source<any>>();
	const isProxiedArray = isArray(value);

	if (isProxiedArray) {
		// Create 'length' source eagerly for arrays
		sources.set("length", new Source((value as unknown[]).length));
	}

	return new Proxy(value, {
		deleteProperty(target, prop) {
			const source = sources.get(prop);
			if (source === undefined) {
				if (prop in target) {
					sources.set(prop, new Source(UNINITIALIZED));
				}
			} else {
				if (isProxiedArray && typeof prop === 'string') {
					const ls = sources.get('length') as Source<number>;
					const index = Number(prop);

					if (Number.isInteger(index) && index >= ls.get()) {
						ls.set(index);
					}
				}
				source.set(UNINITIALIZED);
			}

			return true;
		},
		get(target, prop, receiver) {
			if (prop === STATE_SYMBOL) return value;

			let source = sources.get(prop);
			const exists = prop in target;

			if (
				!source &&
				(!exists || getDescriptor(target, prop)?.writable)
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

			if (source !== undefined) {
				const value = source.get();
				return value === UNINITIALIZED ? undefined : value;
			}

			return Reflect.get(target, prop, receiver);
		},
		getOwnPropertyDescriptor(target, prop) {
			const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

			if (descriptor && 'value' in descriptor) {
				const source = sources.get(prop as string);

				if (source) descriptor.value = source.get();
			} else if (descriptor === undefined) {
				const source = sources.get(prop);
				const value = source?.v;

				if (source !== undefined && value !== UNINITIALIZED) {
					return {
						enumerable: true,
						configurable: true,
						value,
						writable: true,
					}
				}
			}

			return descriptor;
		},
		has(target, prop) {
			if (prop === STATE_SYMBOL) return true;
			let source = sources.get(prop);
			const has = (source !== undefined && source.v !== UNINITIALIZED) || Reflect.has(target, prop);

			if (
				source !== undefined ||
				(activeEffect !== null && (!has || getDescriptor(target, prop)?.writable))
			) {
				if (source === undefined) {
					source = new Source(
						has ?
							createProxy((target as Record<string, unknown>)[prop as string])
							: UNINITIALIZED
					);

					sources.set(prop, source);
				}

				const value = source.get();

				if (value === UNINITIALIZED) {
					return false;
				}
			}

			return has;

		},
		set(target, prop, value, receiver) {
			let source = sources.get(prop as string);
			let has = prop in target;

			if (isProxiedArray && prop === "length") {
				const lengthSource = sources.get("length") as Source<number>;

				if (lengthSource) {
					lengthSource.set(value);
				}

				for (let i = value; i < (target as unknown[]).length; i++) {
					const indexSource = sources.get(i.toString()) as Source<any>;
					if (indexSource) {
						indexSource.set(UNINITIALIZED);
					}
				}
				(target as unknown[]).length = value;
				return true;
			}

			if (
				!source &&
				(!has || getDescriptor(target, prop)?.writable)
			) {
				source = new Source(undefined);
				sources.set(prop, source);
			}

			if (source) {
				has = source?.v !== UNINITIALIZED;
				source?.set(createProxy(value));
			} else {
				Reflect.set(target, prop, value, receiver);
			}

			if (!has) {
				if (isProxiedArray && typeof prop === 'string') {
					const index = Number(prop);
					if (Number.isInteger(index)) {
						const lengthSource = sources.get('length') as Source<number>;
						if (lengthSource && index >= lengthSource.get()) {
							lengthSource.set(index + 1);
						}
					}
				}
			}

			return true;
		},
		ownKeys(target) {
			const ownKeys = Reflect.ownKeys(target).filter(key => {
				const source = sources.get(key);
				return source === undefined || source.v !== UNINITIALIZED;
			});

			for (const [key, source] of sources) {
				if (source?.v !== UNINITIALIZED && !(key in target)) {
					ownKeys.push(key);
				}
			}

			return ownKeys;
		},
	});
}

export function state<T>(obj: T) {
	return createProxy(obj) as T;
}
