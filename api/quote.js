export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    data: {
      quote_id: "123456789",
      quote_number: "Q-2025-001",
      net_total: 1200,
      valid_till: "2025-12-31",
      terms: "Standard terms and conditions apply.",
      status: "Pending",
      items: [
        { product_name: "Product A", description: "Test item", quantity: 2, list_price: 500, discount: 0, tax: 50, line_total: 1050 },
        { product_name: "Product B", description: "Second item", quantity: 1, list_price: 200, discount: 0, tax: 0, line_total: 200 }
      ]
    }
  });
}
