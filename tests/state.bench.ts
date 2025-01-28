import { describe, bench } from "vitest";
import { state } from "../src";
import { proxy } from "../src/proxy";

describe("Instatiation", () => {
	bench("State simple", () => {
		const count = state(0);
	});

	bench("State object", () => {
		const count = state({ value: 0 });
	});

	bench("Proxy simple", () => {
		const count = proxy(0);
	});

	bench("Proxy object", () => {
		const count = proxy({ value: 0 });
	});
});

describe("Increment", () => {
	let count = state(0);
	const countValue = state({ value: 0 });
	let proxySimple = proxy(0);
	const proxyValue = proxy({ value: 0 });

	bench("state", () => {
		count = 1;
	});

	bench("state with object", () => {
		countValue.value = 1;
	});

	bench("proxy", () => {
		proxySimple = 1;
	});

	bench("proxy with object", () => {
		proxyValue.value = 1;
	});
});

describe("Simple random increment", () => {
	let countNormal = state(0);
	let countRandom = state(0);
	let proxyNormal = proxy(0);
	let proxyRandom = proxy(0);

	bench("state normal", () => {
		countNormal = Math.round(Math.random());
	});

	bench("state random", () => {
		countRandom = Math.round(Math.random());
	});

	bench("proxy normal", () => {
		proxyNormal = Math.round(Math.random());
	});

	bench("proxy random", () => {
		proxyRandom = Math.round(Math.random());
	});
});

describe("Object random increment", () => {
	const countNormal = state({ value: 0 });
	const countRandom = state({ value: 0 });

	const proxyNormal = proxy({ value: 0 });
	const proxyRandom = proxy({ value: 0 });

	bench("state normal", () => {
		countNormal.value = Math.round(Math.random());
	});

	bench("state random", () => {
		countRandom.value = Math.round(Math.random());
	});

	bench("state normal", () => {
		proxyNormal.value = Math.round(Math.random());
	});

	bench("state random", () => {
		proxyRandom.value = Math.round(Math.random());
	});
});
