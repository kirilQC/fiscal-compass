"use client";

import { useState } from "react";
import { dateLabel, moneyExact, prettyMerchant } from "@/lib/format";
import { CategorySelect } from "@/components/sections/CategorySelect";
import { SPEND_CATEGORIES, type SpendClass, type Tag } from "@/lib/spend";
import { SpendTag } from "./SpendTag";
import s from "./SpendingPage.module.css";
import { MerchantCell } from "@/components/MerchantLogo";

export interface Txn {
  id: string;
  postedOn: string;
  merchant: string;
  amountCents: number;
  category: string;
  accountName: string;
  accountKind: string;
  isTransfer: boolean;
  isIncome: boolean;
  status: string;
  spendClass: Tag | null;
  spendClassManual?: boolean;
  logoUrl?: string | null;
}

const CATEGORIES: string[] = [...SPEND_CATEGORIES];

function Table({ rows, onRetag }: { rows: Txn[]; onRetag?: (id: string, next: SpendClass) => void }) {
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Merchant</th>
          <th>Type</th>
          <th>Category</th>
          <th className={s.r}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className={t.status === "pending" ? s.pending : undefined}>
            <td className={`${s.date} num`}>{dateLabel(t.postedOn)}</td>
            <td>
              <MerchantCell src={t.logoUrl} name={prettyMerchant(t.merchant)} category={t.category}>
                <span className={s.muted}>{t.accountName}</span>
                {t.status === "pending" ? <span className={s.muted}>pending</span> : null}
                {t.isTransfer ? <span className={s.tag}>transfer</span> : null}
              </MerchantCell>
            </td>
            <td>{t.spendClass ? <SpendTag key={t.spendClass} id={t.id} value={t.spendClass} onChange={(next) => onRetag?.(t.id, next)} /> : <span className={s.muted}>—</span>}</td>
            <td><CategorySelect id={t.id} value={t.category} options={CATEGORIES} /></td>
            <td className={`${s.r} num`}>{t.amountCents < 0 ? "−" : "+"}{moneyExact(Math.abs(t.amountCents))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TransactionLists({ spend, all, monthName, loading, onRetag }: { spend: Txn[]; all: Txn[]; monthName: string; loading: boolean; onRetag?: (id: string, next: SpendClass) => void }) {
  const [shown, setShown] = useState(20);
  const [withTransfers, setWithTransfers] = useState(false);
  const biggest = [...spend].sort((a, z) => a.amountCents - z.amountCents).slice(0, 20);
  const list = withTransfers ? all : spend;
  if (loading) return <p className={s.hint}>Loading {monthName}…</p>;
  if (all.length === 0) return <p className={s.hint}>No transactions in {monthName}.</p>;
  return (
    <div className={s.two}>
      <div>
        <h2 className={s.h2}>Biggest in {monthName}</h2>
        <p className={s.lede}>top 20 by amount</p>
        <Table rows={biggest} onRetag={onRetag} />
      </div>
      <div>
        <h2 className={s.h2}>All transactions</h2>
        <p className={s.lede}>
          newest first · {list.length} in {monthName}
          <button type="button" className={s.toggle} onClick={() => setWithTransfers(!withTransfers)}>{withTransfers ? "hide transfers & income" : "show transfers & income"}</button>
        </p>
        <Table rows={list.slice(0, shown)} onRetag={onRetag} />
        {list.length > shown ? <button type="button" className={s.more} onClick={() => setShown(shown + 20)}>View 20 more</button> : null}
      </div>
    </div>
  );
}
