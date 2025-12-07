import { QBOClient } from './client.js';
import {
  TimeActivity,
  Customer,
  QueryResponse,
  CustomerQueryResponse,
  QueryResponseSchema,
  CustomerQueryResponseSchema,
} from '../types/qbo.js';

export class QBOApi {
  private client: QBOClient;

  constructor(client: QBOClient) {
    this.client = client;
  }

  /**
   * Query TimeActivity records by date range and optional customer
   */
  async queryTimeActivities(
    startDate: string,
    endDate: string,
    customerId?: string
  ): Promise<TimeActivity[]> {
    console.error(`[QBOApi] Querying TimeActivities from ${startDate} to ${endDate}${customerId ? ` for customer ${customerId}` : ''}`);

    let query = `SELECT * FROM TimeActivity WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`;

    if (customerId) {
      query += ` AND CustomerRef = '${customerId}'`;
    }

    query += ' ORDER BY TxnDate';

    const response = await this.client.query<QueryResponse>(query);
    const validated = QueryResponseSchema.parse(response);

    const activities = validated.QueryResponse.TimeActivity || [];
    console.error(`[QBOApi] Found ${activities.length} time activities`);

    return activities;
  }

  /**
   * Search for customers by name (job name)
   */
  async searchCustomers(searchTerm: string): Promise<Customer[]> {
    console.error(`[QBOApi] Searching for customers matching: "${searchTerm}"`);

    // Escape single quotes in search term
    const escapedTerm = searchTerm.replace(/'/g, "\\'");

    const query = `SELECT * FROM Customer WHERE DisplayName LIKE '%${escapedTerm}%' OR FullyQualifiedName LIKE '%${escapedTerm}%'`;

    const response = await this.client.query<CustomerQueryResponse>(query);
    const validated = CustomerQueryResponseSchema.parse(response);

    const customers = validated.QueryResponse.Customer || [];
    console.error(`[QBOApi] Found ${customers.length} customers:`, customers.map(c => c.DisplayName).join(', '));

    return customers;
  }

  /**
   * Get customer by exact display name
   */
  async getCustomerByName(name: string): Promise<Customer | null> {
    console.error(`[QBOApi] Getting customer by exact name: "${name}"`);

    // Escape single quotes
    const escapedName = name.replace(/'/g, "\\'");

    const query = `SELECT * FROM Customer WHERE DisplayName = '${escapedName}'`;

    const response = await this.client.query<CustomerQueryResponse>(query);
    const validated = CustomerQueryResponseSchema.parse(response);

    const customers = validated.QueryResponse.Customer || [];
    console.error(`[QBOApi] Found ${customers.length} exact match${customers.length !== 1 ? 'es' : ''}`);

    return customers.length > 0 ? customers[0] : null;
  }

  /**
   * Get all customers
   */
  async getAllCustomers(): Promise<Customer[]> {
    const query = 'SELECT * FROM Customer';

    const response = await this.client.query<CustomerQueryResponse>(query);
    const validated = CustomerQueryResponseSchema.parse(response);

    return validated.QueryResponse.Customer || [];
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string): Promise<Customer | null> {
    const query = `SELECT * FROM Customer WHERE Id = '${customerId}'`;

    const response = await this.client.query<CustomerQueryResponse>(query);
    const validated = CustomerQueryResponseSchema.parse(response);

    const customers = validated.QueryResponse.Customer || [];
    return customers.length > 0 ? customers[0] : null;
  }
}
