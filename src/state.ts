import { batchDepth, batchQueue } from "./batch.js";
import { activeEffect } from "./effect.js";
import { ReactiveMap, ReactiveSet } from "./iterators.js";
import { STATE_SYMBOL, UNINITIALIZED } from "./symbols.js";
import type { Equals, Reaction, Value } from "./types.js";
import { getDescriptor, isArray } from "./utils.js";

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
				const length = (source as Source<number>).v;
				for (let i = value; i < length; i++) {
					let otherSource = sources.get(String(i));
					if (otherSource !== undefined) {
						otherSource.set(undefined);
					} else if (i in target) {
						otherSource = new Source(UNINITIALIZED);
						sources.set(String(i), otherSource)
					}
				}
			}

			if (
				!source &&
				(!has || getDescriptor(target, prop)?.writable)
			) {
				source = new Source(undefined);
				sources.set(prop, source);
			} else {
				has = source?.v !== UNINITIALIZED;
				source?.set(createProxy(value));
			}

			const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

			if (descriptor?.set) {
				descriptor.set.call(target, receiver);
			}

			if (!has) {
				if (isProxiedArray && typeof prop === 'string') {
					const index = Number(prop);
					if (Number.isInteger(index)) {
						const ls = sources.get('length') as Source<number>;
						if (index >= ls.get()) {
							ls.set(index + 1);
						}
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
