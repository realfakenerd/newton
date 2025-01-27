export type Equals<T> = (a: T, b: T) => boolean;

export type EffectFn = (() => void) | (() => Promise<void>);

export interface Signal {
	/** Flags bitmask */
	f: number;
}

export interface Value<V = unknown> extends Signal {
	v: V;
	reactions: Reaction[] | null;
	equals: Equals<V>;
}

export interface Reaction extends Signal {
	flags: number;
	fn: EffectFn | null;
	deps: Value[] | null;
}

export interface DerivedValue<T = any> {
	flags: number;
	writeVersion: number;
	readVersion: number;
	reactions: Reaction[] | null;
	deps: Value[] | null;
	value: T;
	fn: () => T;
	equals: Equals<T>;
	computeCount: number;
	lastComputedTime: number;
	cacheThreshold: number;
	parent: DerivedValue<any> | null;
	children: DerivedValue<any>[] | null;
}
