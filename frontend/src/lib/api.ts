import axios from "axios";
import type { Service, StatusDay, CreateServicePayload, UpdateServicePayload } from "@/types";

const api = axios.create({ baseURL: "/" });

export async function getServices(): Promise<Service[]> {
  const { data } = await api.get<Service[]>("/services");
  return data;
}

export async function createService(payload: CreateServicePayload): Promise<Service> {
  const { data } = await api.post<Service>("/services", payload);
  return data;
}

export async function updateService(id: string, payload: UpdateServicePayload): Promise<Service> {
  const { data } = await api.put<Service>(`/services/${id}`, payload);
  return data;
}

export async function deleteService(id: string): Promise<void> {
  await api.delete(`/services/${id}`);
}

export async function getStatusLogs(serviceId: string): Promise<StatusDay[]> {
  const { data } = await api.get<StatusDay[]>(`/status-logs/${serviceId}`);
  return data;
}
