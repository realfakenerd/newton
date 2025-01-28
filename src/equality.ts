/**
 * Compares the value of the signal to the given value.
 *
 * The default implementation uses the `===` operator to compare the values.
 *
 * @param this The signal instance.
 * @param value The value to compare to.
 * @returns `true` if the values are equal, `false` otherwise.
 */
export function equals(this: any, value: unknown) {
	return value === this.v;
}

function safeNotEquals(a: unknown, b: unknown) {
	return a !== a
		? b === b
		: notEqual(a, b) ||
				(a !== null && typeof a === "object") ||
				typeof a === "function";
}

export function notEqual(a: unknown, b: unknown) {
	return a !== b;
}

export function safeEquals(this: any, value: unknown) {
	return !safeNotEquals(value, this.v);
}
