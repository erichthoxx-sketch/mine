import assert from "node:assert/strict";
import test from "node:test";
import { expenseReport, expensesHtml, mergeExpenses, restoreExpenses, savedEstimate } from "../ai/expenses.js";

const now = new Date("2026-11-24T04:00:00Z");
const filters = {period:"7", project:"", provider:"", unit:"USD"};

test("expenses restore old chats and preserve a later receipt once across backups", () => {
  const state = {projects:[{id:"book",name:"Роман"}],chats:[{id:"chat",projectId:"book",title:"Глава",messages:[
    {role:"assistant",apiProvider:"apimira",apimiraRequestId:"transaction",at:"2026-11-23T22:00:00Z",
      apiUsage:{prompt_tokens:427294,completion_tokens:24515},costEstimate:{currency:"USD",amount:.45}},
    {role:"assistant",provider:"Qwen"},
    {role:"assistant",apiProvider:"apimira",costEstimate:{currency:"USD",amount:.99}}
  ]}]};
  const rows = restoreExpenses(state);
  assert.equal(rows.length,1);
  const copy = {...rows[0],id:"backup-version",charges:{USD:.609061}};
  const restored = restoreExpenses({...state,expenses:mergeExpenses(rows,[copy])});
  assert.equal(restored.length,1);
  assert.equal(restored[0].charges.USD,.609061);
  assert.equal(restored[0].quote.amount,.45);
  assert.equal(restored[0].inputTokens,427294);
  const report = expenseReport(restored,filters,now);
  assert.equal(report.confirmed,1);
  assert.equal(report.totals.USD,.609061);
  assert.equal(report.points.at(-1).value,.609061,"22:00 UTC belongs to the next calendar day in Moscow");
});

test("the spend report filters paid and pending requests without summing unlike units", () => {
  const date="2026-11-24T03:00:00Z";
  const rows=[
    {id:"a",provider:"bothub",projectId:"book",at:date,charges:{RUB:12.50,CAPS:4200}},
    {id:"b",provider:"apimira",projectId:"book",at:date,charges:{},quote:savedEstimate({estimateUsd:.50})},
    {id:"c",provider:"apimira",projectId:"other",at:date,charges:{USD:.609061}},
    {id:"d",provider:"aitunnel",projectId:"book",at:"2026-10-21T03:00:00Z",charges:{RUB:32}}
  ];
  const report=expenseReport(rows,filters,now);
  assert.deepEqual(report.totals,{RUB:12.50,USD:.609061,CAPS:4200});
  assert.equal(report.confirmed,2);
  const pending=expenseReport(rows,{...filters,provider:"apimira",project:"book"},now);
  assert.deepEqual(pending.totals,{});
  assert.equal(pending.rows.length,1);
  const html=expensesHtml(pending,{...filters,provider:"apimira",project:"book"},
    {esc:String,projects:[],chats:new Set(),providers:{apimira:"ApiMira"}});
  assert.match(html,/Чек не получен/);
  assert.doesNotMatch(html,/f-spend-chart/);
  const all=expenseReport(rows,{...filters,period:"all",unit:"RUB"},now);
  assert.deepEqual(all.points.map(point=>point.value),[32,12.50]);
});
