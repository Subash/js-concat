declare module "js-concat" {
  interface ConcatOptions {
    file: string;
    output: string;
    rootDir?: string;
    sourceMap?: boolean;
    inputSourceMap?: string;
  }

  interface ConcatResult {
    code: string;
    map?: string;
  }

  export default function compile(
    code: string,
    options: ConcatOptions
  ): Promise<ConcatResult>;
}
