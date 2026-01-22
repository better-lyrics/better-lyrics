import { compileWithDetails, type CompileError as RicsError, type CompileWarning as RicsWarning } from "rics";
import { LOG_PREFIX_EDITOR } from "@constants";
import { truncateSource } from "@utils";

const COMPILE_TIMEOUT = 3000;
const MAX_ITERATIONS = 10000;
const HARD_TIMEOUT = 5000;

function suppressConsoleDuringCompile<T>(fn: () => T): T {
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, original);
  }
}

interface DiagnosticLocation {
  line?: number;
  column?: number;
}

interface CompileDiagnostic {
  message: string;
  location?: DiagnosticLocation;
}

interface CompilationState {
  sourceCode: string;
  compiledCSS: string;
  errors: CompileDiagnostic[];
  warnings: CompileDiagnostic[];
  isValid: boolean;
}

class RicsCompilerService {
  private lastCompilationState: CompilationState | null = null;

  compile(sourceCode: string): CompilationState {
    try {
      const startTime = performance.now();
      const result = suppressConsoleDuringCompile(() =>
        compileWithDetails(sourceCode, {
          timeout: COMPILE_TIMEOUT,
          maxIterations: MAX_ITERATIONS,
        })
      );
      const elapsed = performance.now() - startTime;

      if (elapsed > HARD_TIMEOUT) {
        console.error(
          `[rics] Compilation took too long: ${elapsed.toFixed(0)}ms\nSource:\n${truncateSource(sourceCode)}`
        );
        return this.createErrorState(sourceCode, `Compilation timeout: took ${elapsed.toFixed(0)}ms`);
      }

      const state: CompilationState = {
        sourceCode,
        compiledCSS: result.css,
        errors: this.mapErrors(result.errors),
        warnings: this.mapWarnings(result.warnings),
        isValid: result.errors.length === 0,
      };

      this.lastCompilationState = state;
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(LOG_PREFIX_EDITOR, `Compilation failed: ${message}\nSource:\n${truncateSource(sourceCode)}`);
      return this.createErrorState(sourceCode, message);
    }
  }

  private createErrorState(sourceCode: string, errorMessage: string): CompilationState {
    const state: CompilationState = {
      sourceCode,
      compiledCSS: sourceCode,
      errors: [{ message: errorMessage }],
      warnings: [],
      isValid: false,
    };
    this.lastCompilationState = state;
    return state;
  }

  private mapErrors(errors: RicsError[]): CompileDiagnostic[] {
    return errors.map(error => ({
      message: error.message,
      location: error.start ? { line: error.start.line, column: error.start.column } : undefined,
    }));
  }

  private mapWarnings(warnings: RicsWarning[]): CompileDiagnostic[] {
    return warnings.map(warning => ({
      message: warning.message,
      location: warning.start ? { line: warning.start.line, column: warning.start.column } : undefined,
    }));
  }

  getCompiledCSS(sourceCode: string): string {
    if (this.lastCompilationState?.sourceCode === sourceCode && this.lastCompilationState.isValid) {
      return this.lastCompilationState.compiledCSS;
    }

    const state = this.compile(sourceCode);
    return state.isValid ? state.compiledCSS : sourceCode;
  }

  getLastCompilationState(): CompilationState | null {
    return this.lastCompilationState;
  }

  isValidRics(sourceCode: string): boolean {
    if (this.lastCompilationState?.sourceCode === sourceCode) {
      return this.lastCompilationState.isValid;
    }
    return this.compile(sourceCode).isValid;
  }
}

export const ricsCompiler = new RicsCompilerService();
