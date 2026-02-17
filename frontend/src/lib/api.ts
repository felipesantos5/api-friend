import axios from "axios";
import type { Service, StatusDay, CreateServicePayload, UpdateServicePayload } from "@/types";

import { auth } from "./firebase";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/" });

// Adicionar Token em todas as requisições
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


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
