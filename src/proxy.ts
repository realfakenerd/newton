import { get, set, source } from "./source";
import { STATE_SYMBOL, UNINITIALIZED } from "./symbols";
import type { Value } from "./types";
import {
	arrayPrototype,
	getDescriptor,
	getPrototypeOf,
	isArray,
	objectPrototype,
} from "./utils";

interface ProxyMetadata {
	parent: ProxyMetadata | null;
	owners: Set<() => void> | null;
}

export function proxy<T>(value: T) {
	if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
		return value;
	}

	const prototype = getPrototypeOf(value);

	if (prototype !== objectPrototype && prototype !== arrayPrototype) {
		return value;
	}

	const sources = new Map<string | symbol, Value<any>>();
	const isProxiedArray = isArray(value);
	const version = source(0);

	if (isProxiedArray) {
		sources.set("length", source((value as any[]).length));
	}

	return new Proxy(value, {
		defineProperty(_, prop, descriptor) {
			let signal = sources.get(prop);

			if (!signal) {
				signal = source(descriptor.value);
				sources.set(prop, signal);
			} else {
				set(signal, proxy(descriptor.value));
			}
			return true;
		},
		deleteProperty(target, prop) {
			const signal = sources.get(prop);

			if (!signal) {
				if (prop in target) {
					sources.set(prop, source(UNINITIALIZED));
				}
			} else {
				if (isProxiedArray && typeof prop === "string") {
					const lengthSource = sources.get("length") as Value<number>;
					const index = Number(prop);
					if (Number.isInteger(index) && index < lengthSource.v) {
						set(lengthSource, index);
					}
				}

				set(signal, UNINITIALIZED);
				updateVersion(version);
			}
			return true;
		},
		get(target, prop, receiver) {
			if (prop === STATE_SYMBOL) return value;

			let signal = sources.get(prop);
			const exists = prop in target;

			if (!signal && (!exists || getDescriptor(target, prop)?.writable)) {
				signal = source(proxy(exists ? (target as any)[prop] : UNINITIALIZED));
				sources.set(prop, signal);
			}

			if (signal !== undefined) {
				const value = get(signal);
				return value === UNINITIALIZED ? undefined : value;
			}

			return Reflect.get(target, prop, receiver);
		},
		getOwnPropertyDescriptor(target, prop) {
			const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

			if (descriptor && "value" in descriptor) {
				const signal = sources.get(prop as string);

				if (signal) descriptor.value = get(signal);
				
			} else if (descriptor === undefined) {
				const signal = sources.get(prop);
				const value = signal?.v;

				if (signal !== undefined && value !== UNINITIALIZED) {
					return {
						enumerable: true,
						configurable: true,
						writable: true,
						value,
					};
				}
			}

			return descriptor;
		},
		has(target, prop) {
			if (prop === STATE_SYMBOL) return true;
			let signal = sources.get(prop);
			const has =
				(signal !== undefined && get(signal) !== UNINITIALIZED) ||
				Reflect.has(target, prop);

			if (
				signal !== undefined ||
				(has && getDescriptor(target, prop)?.writable)
			) {
				if (signal === undefined) {
					signal = source(proxy(has ? (target as any)[prop] : UNINITIALIZED));
					sources.set(prop, signal);
				}

				const value = get(signal);
				if (value !== UNINITIALIZED) {
					return false;
				}
			}

			return has;
		},
		set(target, prop, value) {
			let signal = sources.get(prop);
			let has = prop in target;

			if (isProxiedArray && prop === "length") {
				const newLength = value as number;
				const oldLength = (signal as Value<number>).v;

				for (let i = newLength; i < oldLength; i++) {
					const indexSignal = sources.get(String(i));

					if (indexSignal) {
						set(indexSignal, UNINITIALIZED);
					}
				}
			}

			if (!signal) {
				if (!has || getDescriptor(target, prop)?.writable) {
					signal = source(undefined);
					sources.set(prop, signal);
				}
			}

			if (signal) {
				has = signal.v !== UNINITIALIZED;
				set(signal, proxy(value));
			}

			if (!has && isProxiedArray && typeof prop === "string") {
				const index = Number(prop);
				if (Number.isInteger(index) && index < value) {
					const lengthSource = sources.get("length") as Value<number>;
					if (lengthSource && index >= lengthSource.v) {
						set(lengthSource, index + 1);
					}
				}
			}

			updateVersion(version);
			return true;
		},
		ownKeys(target) {
			const ownKeys = Reflect.ownKeys(target).filter((key) => {
				const signal = sources.get(key);
				return signal === undefined || signal.v !== UNINITIALIZED;
			});

			for (const [key, signal] of sources) {
				if (signal?.v !== UNINITIALIZED && !(key in target)) {
					ownKeys.push(key);
				}
			}

			return ownKeys;
		},
	});
}

/**
 * Increments the value of the specified signal by the given delta (default: 1).
 *
 * @param signal The signal whose value is to be incremented.
 * @param delta The amount by which the signal's value is to be incremented.
 */
function updateVersion(signal: Value<number>, delta = 1) {
	set(signal, signal.v + delta);
}

export function getProxiedValue<T>(value: T) {
	if (value !== null && typeof value === "object" && STATE_SYMBOL in value) {
		return (value as any)[STATE_SYMBOL];
	}

	return value;
}

export function is(a: unknown, b: unknown) {
	return Object.is(getProxiedValue(a), getProxiedValue(b));
}
