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

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    width: 226,
    padding: 10,
    fontFamily: "Helvetica",
    fontSize: 8,
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 6,
  },
  businessName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
  },
  tinText: {
    fontSize: 8,
    textAlign: "center" as const,
    marginTop: 2,
  },
  addressText: {
    fontSize: 7,
    textAlign: "center" as const,
    marginTop: 1,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    borderBottomStyle: "dashed" as const,
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 1,
  },
  metaLabel: {
    fontSize: 7,
  },
  metaValue: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  itemRow: {
    marginBottom: 3,
  },
  itemName: {
    fontSize: 7,
  },
  itemDetail: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
  },
  itemQtyPrice: {
    fontSize: 7,
  },
  itemLineTotal: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  summaryRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 1,
  },
  summaryLabel: {
    fontSize: 8,
  },
  summaryValue: {
    fontSize: 8,
  },
  totalRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginTop: 2,
    marginBottom: 2,
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    textAlign: "center" as const,
    marginTop: 6,
  },
  footerText: {
    fontSize: 7,
    textAlign: "center" as const,
  },
  footerBold: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
    marginTop: 2,
  },
});

// ─── Component ──────────────────────────────────────────────────────────────

export function ReceiptPDF({ data }: { data: ReceiptData }) {
  const { transaction: txn, items, branch, business, businessAddress, cashierName } = data;
  const isDiscounted = txn.discountType === "senior" || txn.discountType === "pwd";

  return (
    <Document>
      <Page size={[226, 841]} style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.businessName}>
            {business.name || "RedBox Apparel"}
          </Text>
          {business.tin && (
            <Text style={styles.tinText}>TIN: {business.tin}</Text>
          )}
          <Text style={styles.addressText}>
            {businessAddress || branch.address}
          </Text>
          {businessAddress && businessAddress !== branch.address && (
            <Text style={styles.addressText}>
              Branch: {branch.name} - {branch.address}
            </Text>
          )}
        </View>

        <View style={styles.hr} />

        {/* ── Receipt Metadata ── */}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Receipt #:</Text>
          <Text style={styles.metaValue}>{txn.receiptNumber}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date:</Text>
          <Text style={styles.metaValue}>{formatDateTime(txn.createdAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Cashier:</Text>
          <Text style={styles.metaValue}>{cashierName}</Text>
        </View>

        <View style={styles.hr} />

        {/* ── Itemized Breakdown ── */}
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.styleName} - {item.size}/{item.color}
            </Text>
            <View style={styles.itemDetail}>
              <Text style={styles.itemQtyPrice}>
                {item.quantity} x {formatPrice(item.unitPriceCentavos)}
              </Text>
              <Text style={styles.itemLineTotal}>
                {formatPrice(item.lineTotalCentavos)}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.hr} />

        {/* ── Tax Breakdown ── */}
        {isDiscounted ? (
          <>
            {/* Senior/PWD discount breakdown per BIR requirements */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal (VAT-Inclusive):</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.subtotalCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Less: VAT:</Text>
              <Text style={styles.summaryValue}>
                -{formatPrice(txn.vatAmountCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT-Exempt Amount:</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.subtotalCentavos - txn.vatAmountCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Less: {txn.discountType === "senior" ? "SC" : "PWD"} Discount (20%):
              </Text>
              <Text style={styles.summaryValue}>
                -{formatPrice(txn.discountAmountCentavos)}
              </Text>
            </View>
            <View style={styles.hr} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalValue}>
                {formatPrice(txn.totalCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT Amount:</Text>
              <Text style={styles.summaryValue}>₱0.00</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>You Save:</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.subtotalCentavos - txn.totalCentavos)}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Regular transaction tax breakdown */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal:</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.subtotalCentavos)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT (12%):</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.vatAmountCentavos)}
              </Text>
            </View>
            <View style={styles.hr} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalValue}>
                {formatPrice(txn.totalCentavos)}
              </Text>
            </View>
          </>
        )}

        <View style={styles.hr} />

        {/* ── Payment Section ── */}
        {txn.paymentMethod === "cash" ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cash Tendered:</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.amountTenderedCentavos ?? 0)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Change:</Text>
              <Text style={styles.summaryValue}>
                {formatPrice(txn.changeCentavos ?? 0)}
              </Text>
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

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for your purchase!</Text>
          <Text style={styles.footerBold}>
            THIS SERVES AS YOUR OFFICIAL RECEIPT
          </Text>
        </View>
      </Page>
    </Document>
  );
}
