/** Domain tables without a workspace association cannot substantiate a client filter. */
export class UnsupportedReportClientScope extends Error {
  readonly code = 'REPORT_CLIENT_SCOPE_UNSUPPORTED';
}
