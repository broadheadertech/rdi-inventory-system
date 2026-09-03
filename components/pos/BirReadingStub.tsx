"use client";

// Printable BIR-format X/Y/Z reading stub. Presentational — fed by
// api.pos.birReading.getBirReading. Monospace, thermal-receipt layout.

type Money = number;

export type BirReadingData = {
  readingType: "X" | "Y" | "Z";
  title: string;
  header: {
    businessName: string;
    address: string;
    vatRegTin: string;
    serialNumber: string;
    minNumber: string;
  };
  counters: {
    resetCounter: string;
    zCounter: number | null;
    storeCode: string;
    terminalNo: string;
    date: string; // YYYYMMDD
    generatedAt: number;
    beginningSI: string | null;
    endingSI: string | null;
    salesInvoiceCounter: number;
  };
  transactionSummary: {
    grossSalesCount: number;
    grossSalesCentavos: Money;
    returnsCentavos: Money;
    subTotalCentavos: Money;
    scDiscountCentavos: Money;
    pwdDiscountCentavos: Money;
    othersDiscountCentavos: Money;
    vatAdjustmentsCentavos: Money;
    netSalesCentavos: Money;
  };
  tenderSummary: {
    cash: { count: number; amountCentavos: Money };
    gcash: { count: number; amountCentavos: Money };
    maya: { count: number; amountCentavos: Money };
    grandTotalCentavos: Money;
  };
  cashMovements: {
    cashInCount: number;
    cashInCentavos: Money;
    cashOutCount: number;
    cashOutCentavos: Money;
  };
  transactionDetails: {
    salesTransactionCount: number;
    itemsSoldCount: number;
    noSalesTransaction: number;
    transactionReprintCount: number;
    cashDepositReprintCount: number;
    withdrawalReprintCount: number;
    lineVoidsCount: number;
    cancelledTransactionCount: number;
    priceOverrides: number;
    scTransactionCount: number;
    pwdTransactionCount: number;
  };
  vatComputations: {
    vatableSalesCentavos: Money;
    vatAmountCentavos: Money;
    vatExemptSalesCentavos: Money;
    zeroRatedSalesCentavos: Money;
  };
  accumulated: {
    oldGrandTotalCentavos: number | null;
    newGrandTotalCentavos: number | null;
  } | null;
};

function peso(c: number): string {
  const [whole, frac] = (Math.abs(c) / 100).toFixed(2).split(".");
  const w = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${c < 0 ? "-" : ""}${w}.${frac}`;
}
function mmddyyyy(yyyymmdd: string): string {
  return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(0, 4)}`;
}
function dateTime(ms: number): string {
  const p = new Date(ms + 8 * 60 * 60 * 1000);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(p.getUTCMonth() + 1)}/${z(p.getUTCDate())}/${p.getUTCFullYear()} ${z(p.getUTCHours())}:${z(p.getUTCMinutes())}`;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="whitespace-pre">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-2 text-center font-bold tracking-wider">{children}</p>
  );
}

const RULE = <div className="my-1 border-t border-dashed border-black/50" />;

export function BirReadingStub({ data }: { data: BirReadingData }) {
  const c = data.counters;
  const s = data.transactionSummary;
  const t = data.tenderSummary;
  const d = data.transactionDetails;
  const vat = data.vatComputations;

  return (
    <div className="mx-auto w-[320px] bg-white p-4 font-mono text-[11px] leading-snug text-black">
      {/* Header */}
      <div className="text-center">
        <p className="font-bold uppercase">{data.header.businessName}</p>
        {data.header.address && <p className="uppercase">{data.header.address}</p>}
        {data.header.vatRegTin && <p>VAT Registered TIN: {data.header.vatRegTin}</p>}
        <p>
          SN: {data.header.serialNumber || "________"}{"   "}
          MIN: {data.header.minNumber || "________"}
        </p>
      </div>

      <SectionTitle>{data.title}</SectionTitle>

      {/* Counters */}
      <div className="space-y-0.5">
        <Row label="Reset Counter No." value={c.resetCounter} />
        {data.readingType === "Z" && (
          <Row label="Z-Counter" value={String(c.zCounter ?? "").padStart(8, "0")} />
        )}
        <Row label="Store Code" value={c.storeCode} />
        <Row label="Terminal No." value={c.terminalNo} />
        <Row label="System Log Date" value={mmddyyyy(c.date)} />
        <Row label="Computer Date/Time" value={dateTime(c.generatedAt)} />
        <Row label="Beginning SI Number" value={c.beginningSI ?? "—"} />
        <Row label="Ending SI Number" value={c.endingSI ?? "—"} />
        <Row label="Sales Invoice Counter" value={c.salesInvoiceCounter} />
      </div>

      <SectionTitle>TRANSACTION SUMMARY</SectionTitle>
      <div className="space-y-0.5">
        <Row label={`Gross Sales        ${s.grossSalesCount}`} value={peso(s.grossSalesCentavos)} />
        <Row label=" Less: Returns" value={peso(s.returnsCentavos)} />
        {RULE}
        <Row label="Sub-Total:" value={peso(s.subTotalCentavos)} />
        <p className="mt-1"> Less:</p>
        <Row label="  SC Discounts" value={peso(s.scDiscountCentavos)} />
        <Row label="  PWD Discounts" value={peso(s.pwdDiscountCentavos)} />
        <Row label="  Others (Regular)" value={peso(s.othersDiscountCentavos)} />
        <Row label="  VAT Adjustments" value={peso(s.vatAdjustmentsCentavos)} />
        {RULE}
        <Row label="Net Sales:" value={peso(s.netSalesCentavos)} />
      </div>

      <SectionTitle>TENDER SUMMARY</SectionTitle>
      <div className="space-y-0.5">
        <Row label={`CASH               ${t.cash.count}`} value={peso(t.cash.amountCentavos)} />
        {t.gcash.amountCentavos > 0 && (
          <Row label={`GCASH              ${t.gcash.count}`} value={peso(t.gcash.amountCentavos)} />
        )}
        {t.maya.amountCentavos > 0 && (
          <Row label={`MAYA               ${t.maya.count}`} value={peso(t.maya.amountCentavos)} />
        )}
        {RULE}
        <Row label="Grand Total" value={peso(t.grandTotalCentavos)} />
      </div>

      {(data.cashMovements.cashInCount > 0 || data.cashMovements.cashOutCount > 0) && (
        <>
          <SectionTitle>CASH IN / OUT</SectionTitle>
          <div className="space-y-0.5">
            <Row
              label={`Cash In            ${data.cashMovements.cashInCount}`}
              value={peso(data.cashMovements.cashInCentavos)}
            />
            <Row
              label={`Cash Out           ${data.cashMovements.cashOutCount}`}
              value={peso(data.cashMovements.cashOutCentavos)}
            />
          </div>
        </>
      )}

      <SectionTitle>TRANSACTION DETAILS</SectionTitle>
      <div className="space-y-0.5">
        <Row label="Sales Transaction Count" value={d.salesTransactionCount} />
        <Row label="Items Sold Count" value={d.itemsSoldCount} />
        <Row label="No Sales Transaction" value={d.noSalesTransaction} />
        <Row label="Transaction Reprint Count" value={d.transactionReprintCount} />
        <Row label="Cash Deposit Reprint Count" value={d.cashDepositReprintCount} />
        <Row label="Withdrawal Reprint Count" value={d.withdrawalReprintCount} />
        <Row label="Line Voids Count" value={d.lineVoidsCount} />
        <Row label="Cancelled Transaction Count" value={d.cancelledTransactionCount} />
        <Row label="Price Overrides" value={d.priceOverrides} />
        <Row label="SC Transaction Count" value={d.scTransactionCount} />
        <Row label="PWD Transaction Count" value={d.pwdTransactionCount} />
      </div>

      <SectionTitle>VAT COMPUTATIONS</SectionTitle>
      <div className="space-y-0.5">
        <Row label="VATable Sales" value={peso(vat.vatableSalesCentavos)} />
        <Row label="VAT Amount" value={peso(vat.vatAmountCentavos)} />
        <Row label="VAT-Exempt Sales" value={peso(vat.vatExemptSalesCentavos)} />
        <Row label="Zero-Rated Sales" value={peso(vat.zeroRatedSalesCentavos)} />
      </div>

      {data.accumulated && (
        <>
          <SectionTitle>ACCUMULATED SALES</SectionTitle>
          <div className="space-y-0.5">
            <Row
              label="Old Grand Total"
              value={peso(data.accumulated.oldGrandTotalCentavos ?? 0)}
            />
            <Row
              label="New Grand Total"
              value={peso(data.accumulated.newGrandTotalCentavos ?? 0)}
            />
          </div>
        </>
      )}
    </div>
  );
}
