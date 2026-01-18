import { Octokit } from '@octokit/rest';

export class GitHubClient {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get PR details including mergeable state
   */
  async getPullRequest(prNumber) {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  /**
   * List all open pull requests
   */
  async listOpenPullRequests() {
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      per_page: 100,
    });
    return data;
  }

  /**
   * Get files changed in a PR
   */
  async getPullRequestFiles(prNumber) {
    const { data } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return data;
  }

  /**
   * Create a comment on a PR
   */
  async createComment(prNumber, body) {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      body,
    });
    return data;
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName, sha) {
    const { data } = await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha,
    });
    return data;
  }

  /**
   * Update a branch reference
   */
  async updateBranch(branchName, sha, force = false) {
    const { data } = await this.octokit.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branchName}`,
      sha,
      force,
    });
    return data;
  }

  /**
   * Get file contents
   */
  async getFileContent(path, ref) {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });
      
      if (data.type === 'file' && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Compare two commits/branches
   */
  async compareCommits(base, head) {
    const { data } = await this.octokit.repos.compareCommits({
      owner: this.owner,
      repo: this.repo,
      base,
      head,
    });
    return data;
  }

  /**
   * Get a specific commit
   */
  async getCommit(sha) {
    const { data } = await this.octokit.repos.getCommit({
      owner: this.owner,
      repo: this.repo,
      ref: sha,
    });
    return data;
  }

  /**
   * Request reviewers for a PR
   */
  async requestReviewers(prNumber, reviewers) {
    const { data } = await this.octokit.pulls.requestReviewers({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      reviewers,
    });
    return data;
  }

  /**
   * Add labels to a PR
   */
  async addLabels(prNumber, labels) {
    const { data } = await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      labels,
    });
    return data;
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName) {
    try {
      await this.octokit.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName,
      });
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }
}

export default GitHubClient;
