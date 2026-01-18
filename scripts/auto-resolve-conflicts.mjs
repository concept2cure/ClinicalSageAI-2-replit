#!/usr/bin/env node

/**
 * Automated merge conflict resolution for GitHub Actions
 * This script detects and attempts to resolve merge conflicts in pull requests
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import GitHubClient from './lib/github-client.mjs';
import {
  loadConfig,
  resolveFileConflicts,
  getConflictedFiles,
  saveResolutionLog,
  isProtectedFile
} from './lib/conflict-resolver.mjs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER || process.env.CURRENT_PR;
const DRY_RUN = process.env.DRY_RUN === 'true';
const TRIGGER_EVENT = process.env.TRIGGER_EVENT || 'workflow_dispatch';

// Parse repository info from GITHUB_REPOSITORY or git remote
function getRepoInfo() {
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    return { owner, repo };
  }

  // Fallback: parse from git remote
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();

    // Try HTTPS URL: https://github.com/owner/repo or https://github.com/owner/repo.git
    let match = remoteUrl.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    // Try SSH URL: git@github.com:owner/repo or git@github.com:owner/repo.git
    match = remoteUrl.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    console.error('Failed to parse GitHub repository URL:', remoteUrl);
  } catch (error) {
    console.error('Failed to determine repository info:', error.message);
  }

  return null;
}

/**
 * Attempt to merge PR branch into base and detect conflicts
 */
async function attemptMerge(pr, client) {
  console.log(`\n🔍 Checking PR #${pr.number}: ${pr.title}`);
  console.log(`   Base: ${pr.base.ref}, Head: ${pr.head.ref}`);
  
  try {
    // Fetch latest
    execSync('git fetch origin', { stdio: 'inherit' });
    
    // Create a temporary branch for testing
    const testBranch = `test-merge-${pr.number}`;
    
    try {
      execSync(`git checkout -b ${testBranch} origin/${pr.base.ref}`, { stdio: 'pipe' });
    } catch (error) {
      console.log(`   ⚠️  Failed to create test branch, cleaning up...`);
      try {
        execSync(`git branch -D ${testBranch}`, { stdio: 'pipe' });
        execSync(`git checkout -b ${testBranch} origin/${pr.base.ref}`, { stdio: 'pipe' });
      } catch (cleanupError) {
        console.error(`   ❌ Failed to create test branch: ${cleanupError.message}`);
        return null;
      }
    }
    
    // Try to merge
    try {
      execSync(`git merge origin/${pr.head.ref}`, { stdio: 'pipe' });
      console.log(`   ✅ No conflicts - PR can be merged cleanly`);
      execSync('git checkout -', { stdio: 'pipe' });
      execSync(`git branch -D ${testBranch}`, { stdio: 'pipe' });
      return { hasConflicts: false };
    } catch (mergeError) {
      // Merge failed - check for conflicts
      const conflictedFiles = getConflictedFiles();
      
      if (conflictedFiles.length === 0) {
        console.log(`   ⚠️  Merge failed but no conflicts detected`);
        execSync('git merge --abort', { stdio: 'pipe' });
        execSync('git checkout -', { stdio: 'pipe' });
        execSync(`git branch -D ${testBranch}`, { stdio: 'pipe' });
        return null;
      }
      
      console.log(`   ⚠️  Found ${conflictedFiles.length} file(s) with conflicts:`);
      conflictedFiles.forEach(file => console.log(`      - ${file}`));
      
      return {
        hasConflicts: true,
        conflictedFiles,
        testBranch
      };
    }
  } catch (error) {
    console.error(`   ❌ Error during merge attempt: ${error.message}`);
    return null;
  }
}

/**
 * Resolve conflicts in files
 */
async function resolveConflicts(conflictedFiles, config, pr) {
  const results = {
    total: conflictedFiles.length,
    resolved: 0,
    protected: 0,
    failed: 0,
    details: []
  };
  
  console.log(`\n🔧 Attempting to resolve conflicts...`);
  
  for (const file of conflictedFiles) {
    console.log(`\n   📄 ${file}`);
    
    if (isProtectedFile(file, config)) {
      console.log(`      🔒 Protected file - skipping auto-resolution`);
      results.protected++;
      results.details.push({
        file,
        status: 'protected',
        message: 'File is protected from auto-resolution'
      });
      continue;
    }
    
    const resolution = await resolveFileConflicts(file, config);
    
    if (resolution.resolved) {
      console.log(`      ✅ Resolved ${resolution.conflictsFound} conflict(s) (${resolution.avgConfidence.toFixed(1)}% confidence)`);
      results.resolved++;
      results.details.push({
        file,
        status: 'resolved',
        conflicts: resolution.conflictsFound,
        confidence: resolution.avgConfidence,
        resolutions: resolution.resolutions
      });
    } else if (resolution.protected) {
      console.log(`      🔒 Protected file - skipping`);
      results.protected++;
      results.details.push({
        file,
        status: 'protected',
        message: resolution.message
      });
    } else {
      console.log(`      ❌ Failed: ${resolution.message}`);
      results.failed++;
      results.details.push({
        file,
        status: 'failed',
        message: resolution.message,
        error: resolution.error
      });
    }
  }
  
  return results;
}

/**
 * Create resolution branch and commit
 */
async function createResolutionBranch(pr, results, client, dryRun) {
  const branchName = `auto-resolve/pr-${pr.number}`;
  
  if (dryRun) {
    console.log(`\n[DRY RUN] Would create branch: ${branchName}`);
    return { branchName, created: false, dryRun: true };
  }
  
  try {
    // Stage resolved files
    execSync('git add .', { stdio: 'pipe' });
    
    // Create commit
    const commitMessage = `Auto-resolve conflicts for PR #${pr.number}\n\n` +
      `Resolved ${results.resolved} of ${results.total} conflicting files\n` +
      `Protected: ${results.protected}, Failed: ${results.failed}`;
    
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
    
    // Create branch
    execSync(`git branch -M ${branchName}`, { stdio: 'pipe' });
    
    // Push branch
    execSync(`git push -f origin ${branchName}`, { stdio: 'pipe' });
    
    console.log(`\n✅ Created resolution branch: ${branchName}`);
    
    return { branchName, created: true };
  } catch (error) {
    console.error(`\n❌ Failed to create resolution branch: ${error.message}`);
    return { branchName, created: false, error: error.message };
  }
}

/**
 * Post summary comment on PR
 */
async function postSummaryComment(pr, results, resolutionBranch, client, dryRun) {
  const totalConfidence = results.details
    .filter(d => d.status === 'resolved')
    .reduce((sum, d) => sum + (d.confidence || 0), 0);
  const avgConfidence = results.resolved > 0 ? totalConfidence / results.resolved : 0;
  
  let comment = `## 🤖 Automated Conflict Resolution Report\n\n`;
  comment += `**PR #${pr.number}:** ${pr.title}\n\n`;
  comment += `### Summary\n\n`;
  comment += `- **Total conflicting files:** ${results.total}\n`;
  comment += `- **Successfully resolved:** ${results.resolved} ✅\n`;
  comment += `- **Protected (manual review):** ${results.protected} 🔒\n`;
  comment += `- **Failed to resolve:** ${results.failed} ❌\n`;
  
  if (results.resolved > 0) {
    comment += `- **Average confidence:** ${avgConfidence.toFixed(1)}%\n`;
  }
  
  comment += `\n### Details\n\n`;
  
  results.details.forEach(detail => {
    const emoji = detail.status === 'resolved' ? '✅' : detail.status === 'protected' ? '🔒' : '❌';
    comment += `${emoji} **\`${detail.file}\`**\n`;
    
    if (detail.status === 'resolved') {
      comment += `   - Resolved ${detail.conflicts} conflict(s) with ${detail.confidence.toFixed(1)}% confidence\n`;
      detail.resolutions.forEach((res, idx) => {
        comment += `   - Conflict ${idx + 1}: ${res.strategyDescription} (${res.confidence}%)\n`;
      });
    } else {
      comment += `   - ${detail.message}\n`;
    }
    comment += `\n`;
  });
  
  if (resolutionBranch?.created) {
    comment += `\n### Resolution Branch\n\n`;
    comment += `A new branch \`${resolutionBranch.branchName}\` has been created with the resolved conflicts.\n\n`;
    
    if (avgConfidence >= 90 && results.failed === 0) {
      comment += `✅ **High confidence resolution** - All conflicts resolved with 90%+ confidence. Ready for review!\n`;
    } else if (results.failed > 0) {
      comment += `⚠️ **Manual review required** - Some conflicts could not be auto-resolved.\n`;
    } else {
      comment += `⚠️ **Please review** - Automated resolution completed but manual review recommended.\n`;
    }
  } else if (results.failed > 0 || results.protected > 0) {
    comment += `\n### ⚠️ Manual Resolution Required\n\n`;
    comment += `Some conflicts could not be automatically resolved. Please review and resolve manually.\n`;
  }
  
  comment += `\n---\n`;
  comment += `*Generated by Auto-Resolve Conflicts workflow*\n`;
  
  if (dryRun) {
    console.log(`\n[DRY RUN] Would post comment:\n${comment}`);
    return;
  }
  
  try {
    await client.createComment(pr.number, comment);
    console.log(`\n✅ Posted summary comment on PR #${pr.number}`);
  } catch (error) {
    console.error(`\n❌ Failed to post comment: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Auto-Resolve Merge Conflicts\n');
  
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required');
    process.exit(1);
  }
  
  const repoInfo = getRepoInfo();
  if (!repoInfo) {
    console.error('❌ Failed to determine repository information');
    process.exit(1);
  }
  
  console.log(`📦 Repository: ${repoInfo.owner}/${repoInfo.repo}`);
  console.log(`🎯 Trigger: ${TRIGGER_EVENT}`);
  if (DRY_RUN) {
    console.log(`🏃 Mode: DRY RUN (no changes will be made)`);
  }
  
  const client = new GitHubClient(GITHUB_TOKEN, repoInfo.owner, repoInfo.repo);
  const config = loadConfig();
  
  if (!config.autoResolve.enabled) {
    console.log('⚠️  Auto-resolve is disabled in configuration');
    return;
  }
  
  // Determine which PRs to process
  let prsToProcess = [];
  
  if (PR_NUMBER) {
    // Specific PR requested
    try {
      const pr = await client.getPullRequest(parseInt(PR_NUMBER));
      prsToProcess = [pr];
    } catch (error) {
      console.error(`❌ Failed to fetch PR #${PR_NUMBER}: ${error.message}`);
      process.exit(1);
    }
  } else if (TRIGGER_EVENT === 'schedule') {
    // Scheduled run - check all open PRs
    console.log('\n📅 Scheduled run - checking all open PRs...');
    prsToProcess = await client.listOpenPullRequests();
  } else if (TRIGGER_EVENT === 'pull_request') {
    // Triggered by PR event
    if (process.env.CURRENT_PR) {
      const pr = await client.getPullRequest(parseInt(process.env.CURRENT_PR));
      prsToProcess = [pr];
    }
  }
  
  if (prsToProcess.length === 0) {
    console.log('ℹ️  No pull requests to process');
    return;
  }
  
  console.log(`\n📋 Processing ${prsToProcess.length} pull request(s)\n`);
  
  // Process each PR
  for (const pr of prsToProcess) {
    // Skip if not mergeable
    if (pr.merged || pr.state !== 'open') {
      console.log(`⏭️  Skipping PR #${pr.number} (${pr.state}${pr.merged ? ', merged' : ''})`);
      continue;
    }
    
    // Check if PR has conflicts
    if (pr.mergeable === true) {
      console.log(`✅ PR #${pr.number} has no conflicts - skipping`);
      continue;
    }
    
    // Attempt merge and detect conflicts
    const mergeResult = await attemptMerge(pr, client);
    
    if (!mergeResult || !mergeResult.hasConflicts) {
      // Clean up and continue
      try {
        execSync('git checkout -', { stdio: 'pipe' });
      } catch (e) {}
      continue;
    }
    
    // Resolve conflicts
    const results = await resolveConflicts(mergeResult.conflictedFiles, config, pr);
    
    // Save log
    saveResolutionLog({
      prNumber: pr.number,
      prTitle: pr.title,
      results,
      dryRun: DRY_RUN
    });
    
    // Create resolution branch if any were resolved
    let resolutionBranch = null;
    if (results.resolved > 0) {
      resolutionBranch = await createResolutionBranch(pr, results, client, DRY_RUN);
    }
    
    // Post summary comment
    await postSummaryComment(pr, results, resolutionBranch, client, DRY_RUN);
    
    // Clean up
    try {
      if (!DRY_RUN && resolutionBranch?.created) {
        // Keep the resolution branch
      } else {
        execSync('git merge --abort', { stdio: 'pipe' });
      }
      execSync('git checkout -', { stdio: 'pipe' });
      if (mergeResult.testBranch) {
        execSync(`git branch -D ${mergeResult.testBranch}`, { stdio: 'pipe' });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  
  console.log('\n✅ Auto-resolve workflow completed\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
