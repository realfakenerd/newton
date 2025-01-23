import { describe, it, expect, vi } from "vitest";
import { state, effect } from "../src";

describe("effect", () => {
	it("should run effect when signals change", () => {
		let count = state(0);
		const spy = vi.fn();

		effect(() => {
			spy(count);
		});

		expect(spy).toHaveBeenCalledWith(0);
		count = 1;
		expect(spy).toHaveBeenCalledWith(1);
	});

	it("should dispose effect correctly", () => {
		let count = state(0);
		const spy = vi.fn();

		const dispose = effect(() => {
			spy(count);
		});

		count = 1;
		dispose();
		count = 2;
		expect(spy).toHaveBeenCalledTimes(2); // Initial call + one update before dispose
	});

	it("should handle multiple dependencies", () => {
		let first = state(1);
		let second = state(2);
		const spy = vi.fn();

		effect(() => {
			spy(first + second);
		});

		expect(spy).toHaveBeenCalledWith(3);
		first = 2;
		expect(spy).toHaveBeenCalledWith(4);
		second = 3;
		expect(spy).toHaveBeenCalledWith(5);
	});
});
