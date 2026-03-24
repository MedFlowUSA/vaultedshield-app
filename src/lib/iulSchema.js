export function createEmptyIulPolicyRecord() {
  return {
    policyIdentity: {
      carrier: "",
      productName: "",
      policyType: "",
      policyNumber: "",
      insuredName: "",
      ownerName: "",
      issueDate: "",
      underwritingClass: "",
      maturityDate: "",
      status: "",
    },

    deathBenefit: {
      specifiedAmount: "",
      currentDeathBenefit: "",
      deathBenefitOption: "",
      corridorStatus: "",
    },

    premiumStructure: {
      plannedPremium: "",
      modalPremium: "",
      premiumMode: "",
      targetPremium: "",
      guidelinePremium: "",
      mecStatus: "",
      monthlyGuaranteePremium: "",
      noLapseGuaranteePremium: "",
    },

    cashValue: {
      accumulationValue: "",
      accountValue: "",
      cashValue: "",
      cashSurrenderValue: "",
      surrenderCharge: "",
      netCashValue: "",
    },

    charges: {
      costOfInsurance: "",
      administrativeCharge: "",
      riderCharges: "",
      monthlyDeduction: "",
      premiumLoad: "",
      otherCharges: "",
    },

    loans: {
      loanBalance: "",
      loanType: "",
      loanInterestRate: "",
      netAmountAtRisk: "",
    },

    indexAllocations: [
      // example:
      // {
      //   strategyName: "",
      //   allocationPercent: "",
      //   capRate: "",
      //   participationRate: "",
      //   spread: "",
      //   multiplier: "",
      //   floor: "",
      //   creditedRate: "",
      // }
    ],

    riders: [
      // example:
      // { riderName: "", status: "", cost: "", benefitAmount: "" }
    ],

    statementMetrics: {
      statementDate: "",
      statementPeriodStart: "",
      statementPeriodEnd: "",
      premiumsPaidYTD: "",
      premiumsPaidSinceIssue: "",
      interestCreditedYTD: "",
      interestCreditedSinceIssue: "",
      valueChangeYTD: "",
    },

    performanceHistory: [
      // example:
      // {
      //   statementDate: "",
      //   accumulationValue: "",
      //   cashValue: "",
      //   cashSurrenderValue: "",
      //   loanBalance: "",
      //   creditedInterest: "",
      //   premiumPaid: "",
      //   monthlyDeduction: "",
      // }
    ],

    policyHealth: {
      fundingStatus: "",
      performanceStatus: "",
      loanRiskStatus: "",
      surrenderRiskStatus: "",
      notes: [],
    },

    sourceDocuments: {
      baselineDocumentName: "",
      statementFileNames: [],
    },

    vaultAiSummary: {
      overview: "",
      majorFindings: [],
      concerns: [],
      opportunities: [],
      suggestedQuestions: [],
    },
  };
}
