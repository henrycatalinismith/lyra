import * as fs from "fs/promises";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";
import { parse } from "yaml";

const REPO_PATH = process.env.REPO_PATH ?? envVarNotFound("REPO_PATH");

export async function GET(
  req: NextRequest,
  context: { params: { lang: string; msgId: string } },
) {
  const lang = context.params.lang;
  const yamlFiles: string[] = [];
  const translatedArr: Record<string, string>[] = [];
  for await (const item of getMessageFiles(REPO_PATH + "/src", lang)) {
    yamlFiles.push(item);
    const parsed = parse(await fs.readFile(item, "utf-8"));
    translatedArr.push(flattenObject(parsed));
  }

  return NextResponse.json({
    lang,
    yamlFiles: yamlFiles,
    translations: Object.assign({}, ...translatedArr),
  });
}

/**
 * Filter only yaml files inside locale folder of xx.yaml or xx.yml
 * @param dirPath
 * @param lang
 */
async function* getMessageFiles(
  dirPath: string,
  lang: string,
): AsyncGenerator<string> {
  const items = await fs.readdir(dirPath);
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = await fs.stat(itemPath);
    if (stats.isDirectory()) {
      yield* getMessageFiles(itemPath, lang);
    } else if (
      itemPath.endsWith(`locale/${lang}.yaml`) ||
      itemPath.endsWith(`locale/${lang}.yml`)
    ) {
      yield itemPath;
    }
  }
}

function flattenObject(
  obj: Record<string, any>,
  parentKey: string = "",
): Record<string, string> {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        Object.assign(result, flattenObject(obj[key], newKey));
      } else {
        result[newKey] = obj[key];
      }
    }
  }

  return result;
}

function envVarNotFound(varName: string): never {
  throw new Error(`${varName} variable not defined`);
}
