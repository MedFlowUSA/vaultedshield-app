export const RETIREMENT_FIELD_DICTIONARY = {
  plan_name: {
    type: "text",
    group: "account_identity",
    aliases: ["plan name", "plan", "retirement plan", "account name"],
  },
  institution_name: {
    type: "text",
    group: "account_identity",
    aliases: ["institution", "provider", "custodian", "recordkeeper"],
  },
  institution_key: {
    type: "text",
    group: "account_identity",
    aliases: ["provider key", "institution key"],
  },
  account_number_masked: {
    type: "accountNumber",
    group: "account_identity",
    aliases: ["account number", "account #", "account no", "plan number"],
  },
  account_owner: {
    type: "name",
    group: "account_identity",
    aliases: ["account owner", "owner", "owner name"],
  },
  participant_name: {
    type: "name",
    group: "account_identity",
    aliases: ["participant", "participant name", "employee name", "member name"],
  },
  employer_name: {
    type: "name",
    group: "account_identity",
    aliases: ["employer", "company", "employer name", "plan sponsor"],
  },
  statement_date: {
    type: "date",
    group: "account_identity",
    aliases: ["statement date", "as of", "statement ending", "period ending", "statement generated"],
  },
  plan_status: {
    type: "enum",
    group: "account_identity",
    aliases: ["plan status", "account status", "status"],
  },
  current_balance: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["current balance", "ending balance", "account balance", "total balance"],
  },
  vested_balance: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["vested balance", "vested account balance"],
  },
  available_balance: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["available balance", "available to withdraw", "available amount"],
  },
  loan_balance: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["loan balance", "outstanding loan", "total loan balance"],
  },
  prior_period_balance: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["prior balance", "beginning balance", "previous balance", "balance at beginning of period"],
  },
  monthly_benefit_estimate: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["monthly benefit", "estimated monthly benefit", "projected monthly benefit"],
  },
  lump_sum_estimate: {
    type: "currency",
    group: "balance_metrics",
    aliases: ["lump sum estimate", "estimated lump sum", "lump sum value"],
  },
  employee_contributions: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["employee contribution", "your contributions", "deferrals", "employee contributions"],
  },
  employer_contributions: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["employer contribution", "company contribution", "profit sharing", "employer contributions"],
  },
  employer_match: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["employer match", "company match", "match"],
  },
  roth_balance: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["roth balance", "roth source", "roth account"],
  },
  pre_tax_balance: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["pre-tax balance", "pretax balance", "before-tax balance"],
  },
  rollover_balance: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["rollover balance", "rollover source", "rollover account"],
  },
  ytd_contributions: {
    type: "currency",
    group: "contribution_metrics",
    aliases: ["ytd contributions", "year-to-date contributions", "contributions this year"],
  },
  beneficiary_present: {
    type: "boolean",
    group: "beneficiary_metrics",
    aliases: ["beneficiary", "beneficiary designation", "primary beneficiary", "contingent beneficiary"],
  },
  primary_beneficiary_name: {
    type: "name",
    group: "beneficiary_metrics",
    aliases: ["primary beneficiary", "primary beneficiary name"],
  },
  contingent_beneficiary_name: {
    type: "name",
    group: "beneficiary_metrics",
    aliases: ["contingent beneficiary", "secondary beneficiary", "contingent beneficiary name"],
  },
  normal_retirement_age: {
    type: "integer",
    group: "pension_metrics",
    aliases: ["normal retirement age", "nra"],
  },
  accrued_monthly_benefit: {
    type: "currency",
    group: "pension_metrics",
    aliases: ["accrued monthly benefit", "accrued benefit", "monthly accrued benefit"],
  },
  survivor_option: {
    type: "text",
    group: "pension_metrics",
    aliases: ["survivor option", "joint and survivor", "benefit option"],
  },
};

export const RETIREMENT_FIELD_KEYS = Object.freeze(Object.keys(RETIREMENT_FIELD_DICTIONARY));
