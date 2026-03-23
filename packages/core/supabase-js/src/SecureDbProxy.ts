import type { SecureEdgeInvoker } from './SecureEdgeInvoker'

export type DbProxyFilter = {
  op:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'like'
    | 'ilike'
    | 'is'
    | 'in'
    | 'contains'
    | 'containedBy'
    | 'rangeGt'
    | 'rangeGte'
    | 'rangeLt'
    | 'rangeLte'
    | 'rangeAdjacent'
    | 'overlaps'
    | 'textSearch'
    | 'match'
    | 'not'
    | 'or'
    | 'filter'
  column: string
  value?: unknown
  values?: unknown[]
  config?: Record<string, unknown>
  operator?: string
}

export type DbProxyTableRequest = {
  kind: 'table'
  schema?: string
  table: string
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  select?: string
  filters?: DbProxyFilter[]
  orderBy?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean; referencedTable?: string }>
  limit?: number
  range?: { from: number; to: number }
  single?: 'single' | 'maybeSingle'
  format?: 'json' | 'csv'
  count?: 'exact' | 'planned' | 'estimated'
  head?: boolean
  values?: Record<string, unknown> | Record<string, unknown>[]
  onConflict?: string
}

export type DbProxyRpcRequest = {
  kind: 'rpc'
  schema?: string
  name: string
  args?: Record<string, unknown>
}

export type DbProxyRequest = DbProxyTableRequest | DbProxyRpcRequest

export type SecureDbResponse<T> = {
  data: T | null
  error: Error | null
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

type ExecuteRequest = <T>(request: DbProxyRequest) => Promise<T>

class SecureQueryBuilder<T> implements PromiseLike<SecureDbResponse<T>> {
  constructor(
    private request: DbProxyTableRequest,
    private readonly executeRequest: ExecuteRequest
  ) {}

  private pushFilter(filter: DbProxyFilter): this {
    this.request.filters = [...(this.request.filters ?? []), filter]
    return this
  }

  eq(column: string, value: unknown): this {
    return this.pushFilter({ op: 'eq', column, value })
  }
  neq(column: string, value: unknown): this {
    return this.pushFilter({ op: 'neq', column, value })
  }
  gt(column: string, value: unknown): this {
    return this.pushFilter({ op: 'gt', column, value })
  }
  gte(column: string, value: unknown): this {
    return this.pushFilter({ op: 'gte', column, value })
  }
  lt(column: string, value: unknown): this {
    return this.pushFilter({ op: 'lt', column, value })
  }
  lte(column: string, value: unknown): this {
    return this.pushFilter({ op: 'lte', column, value })
  }
  like(column: string, value: string): this {
    return this.pushFilter({ op: 'like', column, value })
  }
  ilike(column: string, value: string): this {
    return this.pushFilter({ op: 'ilike', column, value })
  }
  is(column: string, value: unknown): this {
    return this.pushFilter({ op: 'is', column, value })
  }
  in(column: string, values: unknown[]): this {
    return this.pushFilter({ op: 'in', column, values })
  }
  contains(column: string, value: unknown): this {
    return this.pushFilter({ op: 'contains', column, value })
  }
  containedBy(column: string, value: unknown): this {
    return this.pushFilter({ op: 'containedBy', column, value })
  }
  overlaps(column: string, value: unknown): this {
    return this.pushFilter({ op: 'overlaps', column, value })
  }
  textSearch(column: string, value: string, config?: Record<string, unknown>): this {
    return this.pushFilter({ op: 'textSearch', column, value, config })
  }
  not(column: string, operator: string, value: unknown): this {
    return this.pushFilter({ op: 'not', column, operator, value })
  }
  or(value: string, config?: Record<string, unknown>): this {
    return this.pushFilter({ op: 'or', column: '_', value, config })
  }
  filter(column: string, operator: string, value: unknown): this {
    return this.pushFilter({ op: 'filter', column, operator, value })
  }
  match(query: Record<string, unknown>): this {
    return this.pushFilter({ op: 'match', column: '_', value: query })
  }
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string }
  ): this {
    this.request.orderBy = [...(this.request.orderBy ?? []), { column, ...options }]
    return this
  }
  limit(value: number): this {
    this.request.limit = value
    return this
  }
  range(from: number, to: number): this {
    this.request.range = { from, to }
    return this
  }
  single(): SecureQueryBuilder<T extends Array<infer U> ? U : T> {
    this.request.single = 'single'
    return this as unknown as SecureQueryBuilder<T extends Array<infer U> ? U : T>
  }
  maybeSingle(): SecureQueryBuilder<T extends Array<infer U> ? U | null : T | null> {
    this.request.single = 'maybeSingle'
    return this as unknown as SecureQueryBuilder<T extends Array<infer U> ? U | null : T | null>
  }
  csv(): this {
    this.request.format = 'csv'
    return this
  }
  select(columns = '*'): this {
    this.request.select = columns
    return this
  }

  async execute(): Promise<SecureDbResponse<T>> {
    try {
      const data = await this.executeRequest<T>(this.request)
      return { data, error: null }
    } catch (error: unknown) {
      return { data: null, error: toError(error) }
    }
  }

  then<TResult1 = SecureDbResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: SecureDbResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

class SecureTableClient {
  constructor(
    private readonly schemaName: string | undefined,
    private readonly table: string,
    private readonly executeRequest: ExecuteRequest
  ) {}

  select<T>(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    return new SecureQueryBuilder<T[]>(
      {
        kind: 'table',
        schema: this.schemaName,
        table: this.table,
        action: 'select',
        select: columns,
        count: options?.count,
        head: options?.head,
      },
      this.executeRequest
    )
  }

  insert<T>(values: Record<string, unknown> | Record<string, unknown>[]) {
    return new SecureQueryBuilder<T[]>(
      {
        kind: 'table',
        schema: this.schemaName,
        table: this.table,
        action: 'insert',
        values,
      },
      this.executeRequest
    )
  }

  update<T>(values: Record<string, unknown>) {
    return new SecureQueryBuilder<T[]>(
      {
        kind: 'table',
        schema: this.schemaName,
        table: this.table,
        action: 'update',
        values,
      },
      this.executeRequest
    )
  }

  delete<T>() {
    return new SecureQueryBuilder<T[]>(
      {
        kind: 'table',
        schema: this.schemaName,
        table: this.table,
        action: 'delete',
      },
      this.executeRequest
    )
  }

  upsert<T>(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
    return new SecureQueryBuilder<T[]>(
      {
        kind: 'table',
        schema: this.schemaName,
        table: this.table,
        action: 'upsert',
        values,
        onConflict: options?.onConflict,
      },
      this.executeRequest
    )
  }
}

export class SecureDbProxyClient {
  private readonly schemaName?: string
  private readonly functionName: string
  private readonly executeRequest: ExecuteRequest

  constructor(
    private readonly invoker: Pick<SecureEdgeInvoker, 'invoke'>,
    options?: {
      schemaName?: string
      functionName?: string
    }
  ) {
    this.schemaName = options?.schemaName
    this.functionName = options?.functionName ?? 'db-proxy'
    this.executeRequest = async <T>(request: DbProxyRequest) => {
      const result = await this.invoker.invoke<{ ok?: boolean; data?: T; error?: string; message?: string }>(
        this.functionName,
        request
      )
      if (!result?.ok) {
        throw new Error(result?.message ?? result?.error ?? 'db-proxy request failed')
      }
      return result.data as T
    }
  }

  schema(nextSchema: string): SecureDbProxyClient {
    return new SecureDbProxyClient(this.invoker, {
      functionName: this.functionName,
      schemaName: nextSchema,
    })
  }

  from(table: string): SecureTableClient {
    return new SecureTableClient(this.schemaName, table, this.executeRequest)
  }

  async rpc<T>(name: string, args?: Record<string, unknown>): Promise<SecureDbResponse<T>> {
    try {
      const data = await this.executeRequest<T>({ kind: 'rpc', schema: this.schemaName, name, args })
      return { data, error: null }
    } catch (error: unknown) {
      return { data: null, error: toError(error) }
    }
  }

  async raw<T>(request: DbProxyRequest): Promise<SecureDbResponse<T>> {
    try {
      const data = await this.executeRequest<T>(request)
      return { data, error: null }
    } catch (error: unknown) {
      return { data: null, error: toError(error) }
    }
  }
}
