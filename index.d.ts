export interface ConcatOptions {
  file: string;
  output: string;
  rootDir?: string;
  sourceMap?: boolean;
  inputSourceMap?: string;
}

export interface ConcatResult {
  code: string;
  map?: string;
}

export default function concat(code: string, options: ConcatOptions): Promise<ConcatResult>;
