import { describe, it, expect, vi } from "vitest";
import { source, mutableSource, markReactions, set, get } from "../src/source"; // ajuste o path para o seu arquivo
import { CLEAN, DERIVED, DIRTY, MAYBE_DIRTY, UNOWNED } from "../src/constants";
import { safeEquals } from "../src/equality";
import { setSignalStatus } from "../src/runtime";
import { activeEffect } from "../src/effect"; // Importe activeEffect para poder mockar nos testes
import type { Reaction, Value } from "../src/types";

vi.mock("../src/runtime", () => ({
	setSignalStatus: vi.fn(),
	incrementWriteVersion: vi.fn(() => 1), // Mock para retornar um valor incrementado
}));
vi.mock("../src/equality", () => ({
	safeEquals: vi.fn((a, b) => a === b), // Mock padrão para safeEquals
}));
vi.mock("../src/effect", () => ({
	activeEffect: null, // Valor inicial mockado para activeEffect
}));

describe("source", () => {
	it("deve criar um signal com o valor inicial correto", () => {
		const sig = source(10);
		expect(sig.v).toBe(10);
	});

	it("deve definir equals como Object.is por padrão", () => {
		const sig = source(10);
		expect(sig.equals).toBe(Object.is);
	});

	it("deve inicializar reactions como null", () => {
		const sig = source(10);
		expect(sig.reactions).toBeNull();
	});

	it("deve inicializar rv e wv como 0", () => {
		const sig = source(10);
		expect(sig.rv).toBe(0);
		expect(sig.wv).toBe(0);
	});
});

describe("mutableSource", () => {
	it("deve criar um mutableSource com o valor inicial correto", () => {
		const sig = mutableSource(20);
		expect(sig.v).toBe(20);
	});

	it("deve definir equals como safeEquals se immutable for false (padrão)", () => {
		const sig = mutableSource(20);
		expect(sig.equals).toBe(safeEquals);
	});

	it("deve manter equals como Object.is se immutable for true", () => {
		const sig = mutableSource(30, true);
		expect(sig.equals).toBe(Object.is);
	});
});

describe("markReactions", () => {
	it("não deve fazer nada se reactions for null", () => {
		const sig = source(1);
		markReactions(sig, DIRTY);
		expect(setSignalStatus).not.toHaveBeenCalled();
	});

	it("deve chamar setSignalStatus para cada reaction com o status fornecido", () => {
		const sig = source(1);
		const reaction1 = { f: CLEAN, reactions: null };
		const reaction2 = { f: CLEAN, reactions: null };
		sig.reactions = [reaction1, reaction2];
		markReactions(sig, DIRTY);
		expect(setSignalStatus).toHaveBeenCalledTimes(2);
		expect(setSignalStatus).toHaveBeenCalledWith(reaction1, DIRTY);
		expect(setSignalStatus).toHaveBeenCalledWith(reaction2, DIRTY);
	});

	it("não deve processar reactions marcadas como DIRTY", () => {
		const sig = source(1);
		const reaction1 = { f: DIRTY, reactions: null };
		const reaction2 = { f: CLEAN, reactions: null };
		sig.reactions = [reaction1, reaction2];
		markReactions(sig, DIRTY);
		expect(setSignalStatus).toHaveBeenCalledTimes(1);
		expect(setSignalStatus).toHaveBeenCalledWith(reaction2, DIRTY);
	});

	it("deve chamar markReactions recursivamente para reactions DERIVED e CLEAN/UNOWNED com MAYBE_DIRTY", () => {
		const sig = source(1);
		const derivedReaction = { f: DERIVED | CLEAN, reactions: null };
		const markReactionsSpy = vi.spyOn({ markReactions }, "markReactions"); // Necessário para espionar a função dentro do mesmo escopo
		sig.reactions = [derivedReaction];
		markReactions(sig, MAYBE_DIRTY);
		expect(setSignalStatus).toHaveBeenCalledTimes(1);
		// @ts-ignore necessário para acessar a função mockada dentro do objeto espionado
		expect(markReactions.markReactions).toHaveBeenCalledTimes(1);
		// @ts-ignore
		expect(markReactions.markReactions).toHaveBeenCalledWith(
			derivedReaction,
			MAYBE_DIRTY,
		);
		markReactionsSpy.mockRestore(); // Limpar o spy após o teste
	});

	// O teste para scheduleEffect foi removido pois a função está comentada no código original.
	// Se em algum momento scheduleEffect for reativado e você quiser testá-lo,
	// você precisará mockar scheduleEffect e adicionar um teste similar ao teste recursivo
	// acima, verificando se scheduleEffect é chamado quando a reaction não é DERIVED.
});

describe("set", () => {
	it("deve atualizar o valor do signal se o novo valor for diferente", () => {
		const sig = mutableSource(10);
		set(sig, 20);
		expect(sig.v).toBe(20);
	});

	it("deve incrementar wv se o valor for alterado", () => {
		const sig = mutableSource(10);
		const initialWv = sig.wv;
		set(sig, 20);
		expect(sig.wv).toBeGreaterThan(initialWv);
	});

	it("deve chamar markReactions com DIRTY se o valor for alterado", () => {
		const sig = mutableSource(10);
		set(sig, 20);
		expect(setSignalStatus).toHaveBeenCalledWith(expect.anything(), DIRTY);
	});

	it("não deve atualizar o valor, wv ou chamar markReactions se o valor for o mesmo", () => {
		const sig = mutableSource(10);
		const initialWv = sig.wv;
		set(sig, 10);
		expect(sig.v).toBe(10);
		expect(sig.wv).toBe(initialWv);
		expect(setSignalStatus).not.toHaveBeenCalled();
	});

	it("deve usar a função equals do signal para comparar valores", () => {
		const sig = mutableSource({ count: 1 });
		const safeEqualsMock = vi.mocked(safeEquals); // Obtém a função mockada para inspecionar chamadas
		set(sig, { count: 1 });
		expect(safeEqualsMock).toHaveBeenCalled();
	});

	it("deve retornar o valor definido", () => {
		const sig = mutableSource(10);
		const returnedValue = set(sig, 20);
		expect(returnedValue).toBe(20);
	});
});

describe("get", () => {
	it("deve retornar o valor atual do signal", () => {
		const sig = source(50);
		expect(get(sig)).toBe(50);
	});

	it("não deve adicionar activeEffect às reactions se activeEffect for null", () => {
        // Garante que activeEffect seja null para este teste
		vi.mocked(activeEffect).mockImplementationOnce(() => null); 
		const sig = source(50);
		get(sig);
		expect(sig.reactions).toBeNull();
	});

	it("deve adicionar activeEffect às reactions se activeEffect não for null e não estiver nas reactions", () => {
		const sig = source(50);
		const mockEffect = {};
		vi.mocked(activeEffect).mockImplementationOnce(() => mockEffect);
		get(sig);
		expect(sig.reactions).toContain(mockEffect);
	});

	it("não deve adicionar activeEffect às reactions se activeEffect já estiver nas reactions", () => {
		const sig = source(50);
		const mockEffect = {};
		sig.reactions = [mockEffect];
		vi.mocked(activeEffect).mockImplementationOnce(() => mockEffect);
		get(sig);
		expect(sig.reactions).toHaveLength(1); // Verifica se o tamanho não aumentou
	});

	it("deve criar o array de reactions se for null e activeEffect não for null", () => {
		const sig = source(50);
		vi.mocked(activeEffect).mockImplementationOnce(() => ({}));
		expect(sig.reactions).toBeNull();
		get(sig);
		expect(sig.reactions).toBeInstanceOf(Array);
	});
});
