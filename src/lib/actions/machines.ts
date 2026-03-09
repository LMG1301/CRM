'use server'

import { supabase } from '../supabase'
import type { ClientMachine } from '../types'

// ─── Client Machines CRUD ───

export async function getClientMachines(prospectId: string): Promise<ClientMachine[]> {
  const { data, error } = await supabase
    .from('client_machines')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function addClientMachine(machine: {
  prospect_id: string
  machine_type: string
  quantity: number
  notes?: string
  installed_at?: string
}): Promise<ClientMachine> {
  const { data, error } = await supabase
    .from('client_machines')
    .insert({
      prospect_id: machine.prospect_id,
      machine_type: machine.machine_type,
      quantity: machine.quantity,
      notes: machine.notes || null,
      installed_at: machine.installed_at || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteClientMachine(machineId: string): Promise<void> {
  const { error } = await supabase
    .from('client_machines')
    .delete()
    .eq('id', machineId)
  if (error) throw new Error(error.message)
}

// ─── Stats aggregation for the Stats page ───

export interface MachineStats {
  totalMachines: number
  byType: Record<string, number>
  clients: Array<{
    prospect_id: string
    prenom: string
    nom: string
    entreprise: string
    machines: Array<{
      machine_type: string
      quantity: number
      installed_at: string | null
    }>
    totalQuantity: number
  }>
}

export async function getMachineStats(): Promise<MachineStats> {
  // Fetch all machines with prospect info
  const { data: machines } = await supabase
    .from('client_machines')
    .select('machine_type, quantity, installed_at, prospect_id')
    .order('created_at', { ascending: false })

  if (!machines || machines.length === 0) {
    return { totalMachines: 0, byType: {}, clients: [] }
  }

  // Aggregate by type
  const byType: Record<string, number> = {}
  let totalMachines = 0
  for (const m of machines) {
    byType[m.machine_type] = (byType[m.machine_type] || 0) + m.quantity
    totalMachines += m.quantity
  }

  // Group by prospect
  const prospectIds = [...new Set(machines.map(m => m.prospect_id))]
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, prenom, nom, entreprise')
    .in('id', prospectIds)

  const prospectMap = new Map((prospects || []).map(p => [p.id, p]))

  const clientMap = new Map<string, {
    prospect_id: string
    prenom: string
    nom: string
    entreprise: string
    machines: Array<{ machine_type: string; quantity: number; installed_at: string | null }>
    totalQuantity: number
  }>()

  for (const m of machines) {
    const p = prospectMap.get(m.prospect_id)
    if (!p) continue
    if (!clientMap.has(m.prospect_id)) {
      clientMap.set(m.prospect_id, {
        prospect_id: m.prospect_id,
        prenom: p.prenom || '',
        nom: p.nom || '',
        entreprise: p.entreprise || '',
        machines: [],
        totalQuantity: 0,
      })
    }
    const entry = clientMap.get(m.prospect_id)!
    entry.machines.push({
      machine_type: m.machine_type,
      quantity: m.quantity,
      installed_at: m.installed_at,
    })
    entry.totalQuantity += m.quantity
  }

  return {
    totalMachines,
    byType,
    clients: Array.from(clientMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity),
  }
}
