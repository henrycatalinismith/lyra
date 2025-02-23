import { Cache } from '@/Cache';
import fs from 'fs';
import fsp from 'fs/promises';
import { IGit } from '@/utils/git/IGit';
import { LyraConfig } from '@/utils/lyraConfig';
import { Octokit } from '@octokit/rest';
import packageJson from '../package.json';
import path from 'path';
import { ServerProjectConfig } from '@/utils/serverConfig';
import { SimpleGitWrapper } from '@/utils/git/SimpleGitWrapper';
import { stringify } from 'yaml';
import { unflattenObject } from '@/utils/unflattenObject';
import { debug, info, warn } from '@/utils/log';
import { WriteLanguageFileError, WriteLanguageFileErrors } from '@/errors';

export class RepoGit {
  private static repositories: {
    [name: string]: Promise<RepoGit>;
  } = {};

  private readonly git: IGit;
  private lyraConfig?: LyraConfig;

  private constructor(private readonly spConfig: ServerProjectConfig) {
    this.git = new SimpleGitWrapper(spConfig.repoPath);
  }

  static async getRepoGit(spConfig: ServerProjectConfig): Promise<RepoGit> {
    const key = spConfig.repoPath;
    if (key in RepoGit.repositories) {
      return RepoGit.repositories[key];
    }
    const { promise, resolve, reject } = Promise.withResolvers<RepoGit>();
    RepoGit.repositories[key] = promise;

    const repository = new RepoGit(spConfig);
    repository.checkoutBaseAndPull().then(() => resolve(repository), reject);

    return promise;
  }

  public static async cloneIfNotExist(
    spConfig: ServerProjectConfig,
  ): Promise<void> {
    if (!fs.existsSync(spConfig.repoPath)) {
      await RepoGit.clone(spConfig);
    }
  }

  private static async clone(spConfig: ServerProjectConfig): Promise<void> {
    debug(`create directory: ${spConfig.repoPath} ...`);
    await fsp.mkdir(spConfig.repoPath, { recursive: true });
    const git = new SimpleGitWrapper(spConfig.repoPath);
    debug(`Cloning repo: ${spConfig.repoPath} ...`);
    await git.clone(spConfig.cloneUrl, spConfig.repoPath);
    debug(`Cloned repo: ${spConfig.repoPath}`);
    debug(`Checkout base branch: ${spConfig.baseBranch} ...`);
    await git.checkout(spConfig.baseBranch);
    debug(`Checked out base branch: ${spConfig.baseBranch}`);
  }

  /**
   * Checkout base branch and pull
   * @returns base branch name
   */
  public async checkoutBaseAndPull(): Promise<string> {
    await this.git.checkout(this.spConfig.baseBranch);
    await this.git.pull();
    return this.spConfig.baseBranch;
  }

  public async saveLanguageFiles(projectPath: string): Promise<string[]> {
    const lyraConfig = await this.getLyraConfig();
    const projectConfig = lyraConfig.getProjectConfigByPath(projectPath);
    const projectStore = await Cache.getProjectStore(projectConfig);
    const languages = await projectStore.getLanguageData();

    return await this.writeLangFiles(
      languages,
      projectConfig.absTranslationsPath,
    );
  }

  public async statusChanged(): Promise<boolean> {
    return await this.git.statusChanged();
  }

  public async newBranchCommitAndPush(
    branchName: string,
    addFiles: string[],
    commitMsg: string,
  ): Promise<void> {
    await this.git.newBranch(branchName, this.spConfig.baseBranch);
    await this.git.add(addFiles);
    await this.git.commit(commitMsg);
    await this.git.push(branchName);
  }

  public async createPR(
    branchName: string,
    prTitle: string,
    prBody: string,
    githubOwner: string,
    githubRepo: string,
    githubToken: string,
  ): Promise<string> {
    const octokit = new Octokit({
      auth: githubToken,
      baseUrl: 'https://api.github.com',
      log: {
        debug: debug,
        error: () => {},
        info: info,
        warn: warn,
      },
      request: {
        agent: undefined,
        fetch: undefined,
        timeout: 0,
      },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: 'Lyra v' + packageJson.version,
    });

    const response = await octokit.rest.pulls.create({
      base: this.spConfig.baseBranch,
      body: prBody,
      head: branchName,
      owner: githubOwner,
      repo: githubRepo,
      title: prTitle,
    });

    return response.data.html_url;
  }

  async getLyraConfig(): Promise<LyraConfig> {
    if (this.lyraConfig === undefined) {
      await RepoGit.cloneIfNotExist(this.spConfig);
      this.lyraConfig = await LyraConfig.readFromDir(this.spConfig.repoPath);
    }
    return this.lyraConfig;
  }

  private async writeLangFiles(
    languages: Record<string, Record<string, string>>,
    translationsPath: string,
  ): Promise<string[]> {
    const paths: string[] = [];
    const result = await Promise.allSettled(
      Object.keys(languages).map(async (lang) => {
        const yamlPath = path.join(
          translationsPath,
          // TODO: what if language file were yaml not yml?
          `${lang}.yml`,
        );
        const yamlOutput = stringify(unflattenObject(languages[lang]), {
          doubleQuotedAsJSON: true,
          singleQuote: true,
        });
        try {
          await fsp.writeFile(yamlPath, yamlOutput);
        } catch (e) {
          throw new WriteLanguageFileError(yamlPath, e);
        }
        paths.push(yamlPath);
      }),
    );
    if (result.some((r) => r.status === 'rejected')) {
      throw new WriteLanguageFileErrors(
        result
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason),
      );
    }
    return paths;
  }
}
