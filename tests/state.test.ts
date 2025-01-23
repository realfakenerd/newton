import { describe, it, expect } from "vitest";
import { state } from "../src";

describe("state", () => {
	it("should create a signal with initial value", () => {
		const count = state(0);
		expect(count).toBe(0);
	});

	it("should update signal value", () => {
		let count = state(0);
		count = 1;
		expect(count).toBe(1);
	});

    it("should handle object properties", () => {
        const user = state({ name: "John", age: 25 });
        expect(user.name).toBe("John");
        user.name = "Jane";
        expect(user.name).toBe("Jane");
    });

    it("should handle nested objects", () => {
        const data = state({
            user: {
                profile: {
                    name: "John"
                }
            }
        });
        expect(data.user.profile.name).toBe("John");
        data.user.profile.name = "Jane";
        expect(data.user.profile.name).toBe("Jane");
    });

    it("should handle arrays", () => {
        const list = state([1, 2, 3]);
        expect(list.length).toBe(3);
        list.push(4);
        expect(list.length).toBe(4);
        expect(list[3]).toBe(4);
    });

    it("should handle array methods", () => {
        const list = state([1, 2, 3]);
        list.splice(1, 1);
        expect(list).toEqual([1, 3]);
        list.unshift(0);
        expect(list).toEqual([0, 1, 3]);
    });

    it("should handle undefined properties", () => {
        const obj = state({} as { name?: string });
        expect(obj.name).toBeUndefined();
        obj.name = "John";
        expect(obj.name).toBe("John");
    });

    it("should handle property deletion", () => {
        const obj = state({ name: "John", age: 25 });
        delete obj.age;
        expect(obj.age).toBeUndefined();
        expect('age' in obj).toBe(false);
    });

    it("should handle Map operations", () => {
        const map = state(new Map([["key1", "value1"]]));
        expect(map.get("key1")).toBe("value1");
        
        map.set("key2", "value2");
        expect(map.get("key2")).toBe("value2");
        expect(map.size).toBe(2);

        map.delete("key1");
        expect(map.has("key1")).toBe(false);
        expect(map.size).toBe(1);
    });

    it("should handle Map iterations", () => {
        const map = state(new Map([["a", 1], ["b", 2]]));
        const entries = Array.from(map.entries());
        expect(entries).toEqual([["a", 1], ["b", 2]]);
        
        const keys = Array.from(map.keys());
        expect(keys).toEqual(["a", "b"]);

        const values = Array.from(map.values());
        expect(values).toEqual([1, 2]);
    });

    it("should handle Set operations", () => {
        const set = state(new Set([1, 2, 3]));
        expect(set.has(1)).toBe(true);
        expect(set.size).toBe(3);

        set.add(4);
        expect(set.has(4)).toBe(true);
        expect(set.size).toBe(4);

        set.delete(1);
        expect(set.has(1)).toBe(false);
        expect(set.size).toBe(3);
    });

    it("should handle Set iterations", () => {
        const set = state(new Set(["a", "b", "c"]));
        const values = Array.from(set.values());
        expect(values).toEqual(["a", "b", "c"]);

        let count = 0;
        for (const value of set) {
            count++;
            expect(typeof value).toBe("string");
        }
        expect(count).toBe(3);
    });
});
