function asciiText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value) {
  return asciiText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function money(value, asset) {
  const amount = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
  return `${amount} ${asset || ''}`.trim();
}

function receiptLines(receipt, index, total) {
  const contributedAt = receipt.created_at
    ? new Date(receipt.created_at).toISOString()
    : 'Unknown date';

  return [
    'Crowdpay Contribution Tax Receipt',
    `Receipt: ${receipt.id}`,
    total > 1 ? `Receipt ${index + 1} of ${total}` : '',
    '',
    `Contributor: ${receipt.contributor_name || 'Contributor'}`,
    `Contributor email: ${receipt.contributor_email || 'Not provided'}`,
    `Contributor wallet: ${receipt.sender_public_key}`,
    '',
    `Campaign: ${receipt.campaign_title}`,
    `Campaign ID: ${receipt.campaign_id}`,
    `Campaign creator: ${receipt.campaign_creator_name || 'Not provided'}`,
    `Campaign status: ${receipt.campaign_status}`,
    '',
    `Contribution amount: ${money(receipt.amount, receipt.asset)}`,
    `Contribution date: ${contributedAt}`,
    `Transaction hash: ${receipt.tx_hash}`,
    '',
    'Note: This receipt is generated from Crowdpay contribution records.',
    'Consult a tax professional to confirm deductibility in your jurisdiction.',
  ].filter((line) => line !== '');
}

function buildPageContent(lines) {
  const commands = ['BT', '/F1 18 Tf', '72 750 Td', `(${escapePdfText(lines[0])}) Tj`, '/F1 10 Tf'];
  for (const line of lines.slice(1)) {
    commands.push('0 -18 Td');
    commands.push(`(${escapePdfText(line)}) Tj`);
  }
  commands.push('ET');
  return commands.join('\n');
}

function buildTaxReceiptPdf(receipts) {
  const rows = Array.isArray(receipts) ? receipts : [receipts];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
  ];

  const pageObjectNumbers = [];
  const contentObjectNumbers = [];

  rows.forEach((receipt, index) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjectNumbers.push(pageObjectNumber);
    contentObjectNumbers.push(contentObjectNumber);
    objects.push('');

    const content = buildPageContent(receiptLines(receipt, index, rows.length));
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`;

  pageObjectNumbers.forEach((pageObjectNumber, index) => {
    objects[pageObjectNumber - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${objects.length + 1} 0 R >> >> /Contents ${contentObjectNumbers[index]} 0 R >>`;
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join('')));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(''));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'ascii');
}

module.exports = {
  buildTaxReceiptPdf,
};
