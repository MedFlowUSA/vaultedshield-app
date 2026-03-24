export const RETIREMENT_POSITION_SECTION_PATTERNS = Object.freeze([
  "investment option",
  "investment options",
  "fund allocation",
  "asset allocation",
  "current investments",
  "investment mix",
  "holdings",
  "portfolio holdings",
  "subaccount",
  "subaccounts",
  "model portfolio",
  "managed portfolio",
  "target date",
]);

export const RETIREMENT_POSITION_ROW_HINTS = Object.freeze([
  "fund name",
  "investment option",
  "subaccount",
  "ticker",
  "shares",
  "units",
  "unit value",
  "price",
  "current value",
  "market value",
  "balance",
  "allocation",
  "% of account",
  "gain/loss",
  "net change",
]);

export const RETIREMENT_POSITION_ASSET_CLASS_HINTS = Object.freeze({
  us_equity: ["stock", "equity", "s&p", "index", "growth", "value", "large cap", "mid cap", "small cap"],
  international_equity: ["international", "global", "world", "eafe", "foreign", "emerging markets"],
  fixed_income: ["bond", "income", "fixed income", "treasury", "government securities"],
  cash: ["money market", "stable value", "cash", "sweep"],
  balanced: ["balanced", "allocation", "blend"],
  real_assets: ["real estate", "reit", "commodity", "inflation"],
});

export const RETIREMENT_POSITION_NAME_HINTS = Object.freeze({
  target_date: ["target retirement", "target date", "freedom", "lifecycle", "lifepath", "retirement 20"],
  model_portfolio: ["model portfolio", "managed portfolio", "advisor model", "advisory portfolio", "managed account"],
  subaccount: ["subaccount", "fixed account", "separate account"],
  pension_option: ["joint and survivor", "single life", "annuity option", "benefit option"],
  indexed_strategy: ["indexed strategy", "crediting strategy", "cap rate", "participation rate"],
});
