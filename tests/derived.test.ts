import { describe, it, expect } from "vitest";
import { state, derived } from "../src";

describe("derived", () => {
	it("should compute derived value from signals", () => {
		let count = state(0);
		const doubled = derived(() => count * 2);
		expect(doubled).toBe(0);

		count = 2;
		expect(doubled).toBe(4);
	});

	it("should update when dependencies change", () => {
		let first = state(1);
		let second = state(2);
		const sum = derived(() => first + second);

		expect(sum).toBe(3);
		first = 2;
		expect(sum).toBe(5);
		second = 3;
		expect(sum).toBe(8);
	});

	it("should handle multiple computations", () => {
		let base = state(1);
		const doubled = derived(() => base * 2);
		const quadrupled = derived(() => doubled * 2);

		expect(quadrupled).toBe(4);
		base = 2;
		expect(quadrupled).toBe(8);
	});
});
