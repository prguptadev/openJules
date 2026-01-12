export declare const SHARED_VERSION = "0.0.1";
export interface Task {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
}
