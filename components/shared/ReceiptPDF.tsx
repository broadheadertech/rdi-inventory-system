import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReceiptData = {
  transaction: {
    receiptNumber: string;
    createdAt: number;
    subtotalCentavos: number;
    vatAmountCentavos: number;
    discountAmountCentavos: number;
    totalCentavos: number;
    paymentMethod: "cash" | "gcash" | "maya";
    discountType: string;
    amountTenderedCentavos?: number;
    changeCentavos?: number;
    splitPayment?: { method: "cash" | "gcash" | "maya"; amountCentavos: number } | null;
  };
  items: {
    styleName: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
  }[];
  branch: { name: string; address: string };
  business: { name: string; tin: string };
  businessAddress: string;
  cashierName: string;
  /** Customer ("Sold To") details — optional; lines print blank for walk-ins. */
  customer?: {
    name?: string;
    tin?: string;
    address?: string;
    businessStyle?: string;
  };
  /** Senior Citizen / PWD details — required on the invoice when a SC/PWD discount applies. */
  scPwd?: { name?: string; idNumber?: string };
  /** BIR registration values — assigned at accreditation/registration. Print as labelled lines. */
  bir?: {
    /** Force accredited mode. If omitted, accredited = a PTU or Accreditation No. is present. */
    accredited?: boolean;
    documentTitle?: string;      // default "SALES INVOICE"
    vatRegTin?: string;          // VAT-registered TIN (falls back to business.tin)
    terminalNumber?: string;     // POS / terminal no.
    minNumber?: string;          // Machine Identification Number
    serialNumber?: string;       // machine serial no.
    accreditationNumber?: string;
    accreditationDate?: string;
    ptuNumber?: string;
    ptuDate?: string;
    softwareName?: string;       // default "RedBox POS"
    softwareVersion?: string;
    supplierName?: string;
    supplierTin?: string;
    supplierAddress?: string;
    // extra fields carried by the stored config are ignored here
    businessName?: string;
    tin?: string;
    businessAddress?: string;
  } | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Manual currency formatting — Intl.NumberFormat is NOT available in react-pdf */
function formatPrice(centavos: number): string {
  const abs = Math.abs(centavos);
  const [whole, frac] = (abs / 100).toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return centavos < 0 ? `-₱${withCommas}.${frac}` : `₱${withCommas}.${frac}`;
}

/** Manual date formatting — avoid Intl dependency in react-pdf environment */
function formatDateTime(timestamp: number): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const pht = new Date(timestamp + PHT_OFFSET_MS);
  const month = MONTHS[pht.getUTCMonth()];
  const day = pht.getUTCDate();
  const year = pht.getUTCFullYear();
  const rawHour = pht.getUTCHours();
  const hour12 = rawHour % 12 || 12;
  const ampm = rawHour < 12 ? "AM" : "PM";
  const minute = String(pht.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year}, ${hour12}:${minute} ${ampm}`;
}

/** Blank underline for a value the customer/operator may fill in by hand. */
function orBlank(value: string | undefined, width = 22): string {
  if (value && value.trim()) return value;
  return "_".repeat(width);
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { width: 226, padding: 10, fontFamily: "Helvetica", fontSize: 8 },
  header: { textAlign: "center" as const, marginBottom: 4 },
  businessName: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center" as const },
  centerTiny: { fontSize: 7, textAlign: "center" as const, marginTop: 1 },
  docTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
    marginVertical: 3,
    letterSpacing: 1,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    borderBottomStyle: "dashed" as const,
    marginVertical: 4,
  },
  row: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 1 },
  label: { fontSize: 7 },
  value: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  fieldLine: { fontSize: 7, marginBottom: 1 },
  sectionLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  itemRow: { marginBottom: 3 },
  itemName: { fontSize: 7 },
  itemDetail: { flexDirection: "row" as const, justifyContent: "space-between" as const },
  itemQtyPrice: { fontSize: 7 },
  itemLineTotal: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  summaryRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 1 },
  summaryLabel: { fontSize: 8 },
  summaryValue: { fontSize: 8 },
  totalRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginTop: 2, marginBottom: 2 },
  totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  footer: { textAlign: "center" as const, marginTop: 4 },
  footerText: { fontSize: 6.5, textAlign: "center" as const, marginTop: 1 },
  footerBold: { fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center" as const, marginTop: 2 },
});

// ─── Component ──────────────────────────────────────────────────────────────

export function ReceiptPDF({ data }: { data: ReceiptData }) {
  const { transaction: txn, items, branch, business, businessAddress, cashierName } = data;
  const bir = data.bir ?? {};
  const customer = data.customer ?? {};
  const isDiscounted = txn.discountType === "senior" || txn.discountType === "pwd";

  // Accredited only when BIR has issued a PTU / Accreditation No. (or explicitly forced).
  // Until then we must NOT print an official-looking BIR invoice.
  const accredited =
    bir.accredited ?? !!(bir.accreditationNumber || bir.ptuNumber);

  // VAT summary box values (BIR-required). Net-of-VAT VATable = subtotal; VAT = vatAmount.
  const vatableSales = isDiscounted ? 0 : txn.subtotalCentavos;
  const vatExemptSales = isDiscounted ? txn.subtotalCentavos - txn.vatAmountCentavos : 0;
  const vatAmount = isDiscounted ? 0 : txn.vatAmountCentavos;

  const vatRegTin = bir.vatRegTin || business.tin;
  const softwareName = bir.softwareName || "RedBox POS";

  return (
    <Document>
      <Page size={[226, 841]} style={styles.page}>
        {/* ── Header: registered seller ── */}
        <View style={styles.header}>
          <Text style={styles.businessName}>{business.name || "RedBox Apparel"}</Text>
          <Text style={styles.centerTiny}>{businessAddress || branch.address}</Text>
          <Text style={styles.centerTiny}>VAT REG TIN: {vatRegTin || orBlank(undefined, 16)}</Text>
          <Text style={styles.centerTiny}>
            {branch.name}{branch.address ? ` — ${branch.address}` : ""}
          </Text>
        </View>

        {/* ── Document title ── */}
        <Text style={styles.docTitle}>
          {accredited ? bir.documentTitle || "SALES INVOICE" : "ORDER SLIP"}
        </Text>

        <View style={styles.hr} />

        {/* ── Invoice metadata ── */}
        <View style={styles.row}>
          <Text style={styles.label}>SI No.:</Text>
          <Text style={styles.value}>{txn.receiptNumber}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date:</Text>
          <Text style={styles.value}>{formatDateTime(txn.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Cashier:</Text>
          <Text style={styles.value}>{cashierName}</Text>
        </View>
        {bir.terminalNumber && (
          <View style={styles.row}>
            <Text style={styles.label}>Terminal:</Text>
            <Text style={styles.value}>{bir.terminalNumber}</Text>
          </View>
        )}

        <View style={styles.hr} />

        {/* ── Sold To (customer) ── */}
        <Text style={styles.sectionLabel}>Sold To:</Text>
        <Text style={styles.fieldLine}>Name: {orBlank(customer.name)}</Text>
        <Text style={styles.fieldLine}>TIN: {orBlank(customer.tin)}</Text>
        <Text style={styles.fieldLine}>Address: {orBlank(customer.address)}</Text>
        <Text style={styles.fieldLine}>Business Style: {orBlank(customer.businessStyle)}</Text>

        <View style={styles.hr} />

        {/* ── Itemized breakdown ── */}
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.styleName} - {item.size}/{item.color}
            </Text>
            <View style={styles.itemDetail}>
              <Text style={styles.itemQtyPrice}>
                {item.quantity} x {formatPrice(item.unitPriceCentavos)}
              </Text>
              <Text style={styles.itemLineTotal}>{formatPrice(item.lineTotalCentavos)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.hr} />

        {/* ── VAT summary box (BIR-required) ── */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>VATable Sales:</Text>
          <Text style={styles.summaryValue}>{formatPrice(vatableSales)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>VAT-Exempt Sales:</Text>
          <Text style={styles.summaryValue}>{formatPrice(vatExemptSales)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Zero-Rated Sales:</Text>
          <Text style={styles.summaryValue}>{formatPrice(0)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>VAT Amount (12%):</Text>
          <Text style={styles.summaryValue}>{formatPrice(vatAmount)}</Text>
        </View>

        <View style={styles.hr} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Sales (VAT Inclusive):</Text>
          <Text style={styles.summaryValue}>{formatPrice(txn.subtotalCentavos)}</Text>
        </View>
        {isDiscounted && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Less: VAT</Text>
              <Text style={styles.summaryValue}>-{formatPrice(txn.vatAmountCentavos)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Less: {txn.discountType === "senior" ? "SC" : "PWD"} Discount (20%)
              </Text>
              <Text style={styles.summaryValue}>-{formatPrice(txn.discountAmountCentavos)}</Text>
            </View>
          </>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL AMOUNT DUE:</Text>
          <Text style={styles.totalValue}>{formatPrice(txn.totalCentavos)}</Text>
        </View>

        {/* ── SC/PWD details (required when discounted) ── */}
        {isDiscounted && (
          <>
            <View style={styles.hr} />
            <Text style={styles.sectionLabel}>
              {txn.discountType === "senior" ? "Senior Citizen" : "PWD"} Details:
            </Text>
            <Text style={styles.fieldLine}>Name: {orBlank(data.scPwd?.name)}</Text>
            <Text style={styles.fieldLine}>
              {txn.discountType === "senior" ? "OSCA/SC ID" : "PWD ID"} No.: {orBlank(data.scPwd?.idNumber)}
            </Text>
            <Text style={styles.fieldLine}>Signature: {orBlank(undefined)}</Text>
          </>
        )}

        <View style={styles.hr} />

        {/* ── Payment ── */}
        {txn.splitPayment ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {txn.paymentMethod === "cash" ? "Cash" : txn.paymentMethod === "gcash" ? "GCash" : "Maya"}:
              </Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.totalCentavos - txn.splitPayment.amountCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {txn.splitPayment.method === "cash" ? "Cash" : txn.splitPayment.method === "gcash" ? "GCash" : "Maya"}:
              </Text>
              <Text style={styles.summaryValue}>{formatPrice(txn.splitPayment.amountCentavos)}</Text>
            </View>
            {txn.paymentMethod === "cash" && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cash Tendered:</Text>
                  <Text style={styles.summaryValue}>{formatPrice(txn.amountTenderedCentavos ?? 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Change:</Text>
                  <Text style={styles.summaryValue}>{formatPrice(txn.changeCentavos ?? 0)}</Text>
                </View>
              </>
            )}
          </>
        ) : txn.paymentMethod === "cash" ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cash Tendered:</Text>
              <Text style={styles.summaryValue}>{formatPrice(txn.amountTenderedCentavos ?? 0)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Change:</Text>
              <Text style={styles.summaryValue}>{formatPrice(txn.changeCentavos ?? 0)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment:</Text>
            <Text style={styles.summaryValue}>
              {txn.paymentMethod === "gcash" ? "GCash" : "Maya"}
            </Text>
          </View>
        )}

        <View style={styles.hr} />

        {/* ── Footer: accredited shows BIR machine details; otherwise a non-official notice ── */}
        {accredited ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {softwareName}{bir.softwareVersion ? ` v${bir.softwareVersion}` : ""}
            </Text>
            <Text style={styles.footerText}>MIN: {orBlank(bir.minNumber, 14)}</Text>
            <Text style={styles.footerText}>Serial No.: {orBlank(bir.serialNumber, 14)}</Text>
            {(bir.supplierName || bir.supplierTin) && (
              <Text style={styles.footerText}>
                Supplier: {orBlank(bir.supplierName, 10)}
                {bir.supplierTin ? `  TIN: ${bir.supplierTin}` : ""}
              </Text>
            )}
            {bir.supplierAddress && (
              <Text style={styles.footerText}>{bir.supplierAddress}</Text>
            )}
            <Text style={styles.footerText}>
              Accreditation No.: {orBlank(bir.accreditationNumber, 14)}
            </Text>
            {bir.accreditationDate && (
              <Text style={styles.footerText}>Date Issued: {bir.accreditationDate}</Text>
            )}
            {(bir.ptuNumber || bir.ptuDate) && (
              <Text style={styles.footerText}>
                PTU No.: {orBlank(bir.ptuNumber, 12)}
                {bir.ptuDate ? `  Date: ${bir.ptuDate}` : ""}
              </Text>
            )}
            <Text style={styles.footerBold}>THIS SERVES AS YOUR SALES INVOICE</Text>
            <Text style={styles.footerText}>Thank you for your purchase!</Text>
          </View>
        ) : (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {softwareName}{bir.softwareVersion ? ` v${bir.softwareVersion}` : ""}
            </Text>
            <Text style={styles.footerBold}>THIS IS NOT AN OFFICIAL RECEIPT</Text>
            <Text style={styles.footerText}>
              Not valid for claim of input tax.
            </Text>
            <Text style={styles.footerText}>
              Please request your BIR-registered Sales Invoice.
            </Text>
            <Text style={styles.footerText}>Thank you for your purchase!</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
