export function githubOAuthQueryParams(chooseAccount: boolean) {
  return chooseAccount ? { prompt: "select_account" } : undefined;
}
