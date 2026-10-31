export interface ConcatOptions {
  file: string;
  output: string;
  rootDir?: string;
  sourceMap?: boolean;
  inputSourceMap?: string;
}

export interface ConcatSource {
  file: string;
  start: number;
  end: number;
}

export interface ConcatResult {
  code: string;
  map?: string;
  sources: ConcatSource[];
}

export default function concat(
  code: string,
  options: ConcatOptions,
): Promise<ConcatResult>;
