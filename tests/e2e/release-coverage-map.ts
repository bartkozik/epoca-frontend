export const RELEASE_VERIFICATION_COVERAGE = [
  {
    kind: 'gate',
    id: 'CT-527',
    backfill: false,
    reason:
      'Guarded deploy smoke: actual frontend/backend SHA, login/SAML, owned worklog creation/readback, projects/edit, reports/export, cleanup before rollback.',
    command: 'node scripts/e2e/run-release-smoke.mjs deploy',
    evidence: { type: 'technical', repository: 'epoca-frontend', job: 'deploy_e2e_smoke' },
  },
  {
    kind: 'gate',
    id: 'CT-527',
    backfill: false,
    reason:
      'Read-only post-rollback smoke: exact rollback SHA pair, prepared persistent compatibility worklog/project/report/export, guarded network and zero domain mutations.',
    command: 'node scripts/e2e/run-release-smoke.mjs rollback',
    evidence: { type: 'technical', repository: 'epoca-frontend', job: 'post_rollback_e2e_smoke' },
  },
] as const satisfies readonly {
  kind: 'gate';
  id: 'CT-527';
  backfill: false;
  reason: string;
  command: string;
  evidence: { type: 'technical'; repository: 'epoca-frontend'; job: 'deploy_e2e_smoke' | 'post_rollback_e2e_smoke' };
}[];
