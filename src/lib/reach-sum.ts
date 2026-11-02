/** Columns that add up across rows; ratios, rates, people counted over the whole range and the ads "Kết quả" (a different goal per campaign) do not. No imports: also used by the Excel of the reach total, tested with plain Node. */
export const additive = (label: string) => !/CTR|CPC|Tần suất|Chi phí \/|Người|tiếp cận|Tỷ lệ|Kết quả/i.test(label);
