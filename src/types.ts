export type Equals<T> = (a: T, b: T) => boolean;

export type EffectFn = () => void;

export interface Signal {
	f: number; // flags
	wv: number; // write version
}

export interface Value<V = unknown> extends Signal {
	v: V; // value
	rv: number; // read version
	equals: Equals<V>;
	reactions: Reaction[] | null;
}

export interface Reaction extends Signal {
	fn: EffectFn | null;
	deps: Value[] | null;
}

export interface Derived<V = unknown> extends Value<V>, Reaction {
	fn: () => V;
	parent: Derived | null;
	children: null | Reaction[];
}

export interface Effect extends Reaction {
	f: number; // flags
	prev: Effect | null;
	next: Effect | null;
	last: Effect | null;
	first: Effect | null;
	parent: Effect | null;
	deriveds: Derived[] | null;
	teardown: EffectFn | null;
}
