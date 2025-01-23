import { Source } from "./state.js";

export const collectionPrototype = {
	Map: Map.prototype,
	Set: Set.prototype,
};

export class ReactiveMap<K, V> extends Map<K, V> {
	#source: Source<number>;

	constructor(values: Iterable<[K, V]>) {
		super();

		if (values) {
			for (const [key, value] of values) {
				this.set(key, value);
			}
		}

		this.#source = new Source(0)
	}


	clear() {
		const hadItems = this.size > 0;
		super.clear();
		if (hadItems) this.#source?.set(this.#source?.get() + 1);
	}

	delete(key: K) {
		const result = super.delete(key);
		if (result) this.#source?.set(this.#source?.get() + 1);
		return result;
	}

	set(key: K, value: V) {
		const hasKey = this.has(key);
		super.set(key, value);
		if (!hasKey) this.#source?.set(this.#source?.get() + 1);
		return this;
	}

	get(key: K) {
		this.#source?.get();
		return super.get(key);
	}

	has(key: K) {
		this.#source?.get();
		return super.has(key);
	}

	get size() {
		this.#source?.get();
		return super.size;
	}
}

export class ReactiveSet<T> extends Set<T> {
	#source: Source<number>;


	constructor(values?: Iterable<T>) {
		super();
		this.#source = new Source(0);

		if (values) {
			for (const value of values) {
				this.add(value);
			}
		}

	}

	add(value: T) {
		const hasValue = this.has(value);
		super.add(value);
		if (!hasValue) this.#source.set(this.#source.get() + 1);
		return this;
	}

	clear() {
		const hadItems = this.size > 0;
		super.clear();
		if (hadItems) this.#source.set(this.#source?.get() + 1);
	}

	delete(value: T) {
		const result = super.delete(value);
		if (result) this.#source.set(this.#source?.get() + 1);
		return result;
	}

	has(value: T) {
		this.#source?.get();
		return super.has(value);
	}

	get size() {
		this.#source?.get();
		return super.size;
	}
}
