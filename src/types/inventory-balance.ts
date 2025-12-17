/**
 * Types for inventory balance snapshotting system
 * These tables maintain running balances updated atomically with transactions
 * for O(1) inventory quantity lookups
 */

// Inventory balance for components
export interface InventoryBalanceRecord {
  id: string
  componentId: string
  locationId: string
  quantity: number
}

// Finished goods balance for SKUs
export interface FinishedGoodsBalanceRecord {
  id: string
  skuId: string
  locationId: string
  quantity: number
}

// Response type for balance updates
export interface BalanceUpdateResult {
  componentId?: string
  skuId?: string
  locationId: string
  previousQuantity: number
  newQuantity: number
}
