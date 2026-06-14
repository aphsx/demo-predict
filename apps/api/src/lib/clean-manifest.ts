/**
 * Shared clean manifest shape (train + predict catalogs).
 */
export interface CleanSkipped {
  customers_no_acc_id: number;
  payments_no_acc_id: number;
  payments_no_date: number;
  usage_no_acc_id: number;
}

export interface CleanManifest {
  raw: Record<string, number>;
  clean: {
    customers: number;
    payments: number;
    usage: number;
  };
  skipped: CleanSkipped;
  warnings: string[];
}

/** @deprecated Use CleanManifest */
export type TrainCleanManifest = CleanManifest;

/** @deprecated Use CleanSkipped */
export type TrainCleanSkipped = CleanSkipped;
