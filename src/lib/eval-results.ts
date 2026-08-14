import { promises as fs } from "fs";
import path from "path";

export type EvalScenarioResult = {
  id: string;
  name: string;
  focus?: string[];
  pass: boolean;
  regexPass?: boolean;
  judgePass?: boolean;
  mode?: string;
  status?: number;
  content?: string;
  mustFail?: string[];
  mustNotFail?: string[];
  structural?: string[];
  judge?: {
    pass: boolean;
    skipped?: boolean;
    reasons?: string[];
  };
  notes?: string;
  error?: string;
};

export type EvalLastRun = {
  at: string;
  version?: number;
  baseUrl: string;
  judge?: boolean;
  passed: number;
  total: number;
  rate: number;
  suitePass: boolean;
  failedIds?: string[];
  results: EvalScenarioResult[];
};

const resultPath = () =>
  path.join(process.cwd(), ".data", "eval-last.json");

export async function readLastEvalRun(): Promise<EvalLastRun | null> {
  try {
    const raw = await fs.readFile(resultPath(), "utf8");
    return JSON.parse(raw) as EvalLastRun;
  } catch {
    return null;
  }
}
