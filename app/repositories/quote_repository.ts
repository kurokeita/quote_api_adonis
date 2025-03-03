import { OrderEnum } from '#enums/order_enum'
import Quote from '#models/quote'
import {
  GetRandomQuoteRequest,
  GetRandomQuotesRequest,
  IndexAllQuotesRequest,
  UpdateQuoteRequest,
} from '#requests/quotes'
import db from '@adonisjs/lucid/services/db'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { DateTime } from 'luxon'

export type NewQuoteSchema = {
  content: string
  author_id: number
}

export default class QuoteRepository {
  async index(
    input: IndexAllQuotesRequest,
    options: {
      withRelations?: boolean
      transaction?: TransactionClientContract
    } = {}
  ) {
    const { withRelations = true, transaction = undefined } = options
    const query = Quote.query({ client: transaction })

    this.filterLength(query, input.minLength, '>=')
      .filterLength(query, input.maxLength, '<=')
      .filterAuthor(query, input.author)
      .filterTags(query, input.tags)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    return await query.orderBy(input.sortBy, input.order).paginate(input.page, input.limit)
  }

  async getRandomQuote(
    input: GetRandomQuoteRequest,
    options: {
      withRelations?: boolean
      transaction?: TransactionClientContract
    } = {}
  ) {
    const { withRelations = true, transaction = undefined } = options
    const query = Quote.query({ client: transaction })

    this.filterLength(query, input.minLength, '>=')
      .filterLength(query, input.maxLength, '<=')
      .filterAuthor(query, input.author)
      .filterTags(query, input.tags)
      .queryContent(query, input.query)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    return await query.orderByRaw('RAND()').first()
  }

  async getRandomQuotes(
    input: GetRandomQuotesRequest,
    options: {
      withRelations?: boolean
      transaction?: TransactionClientContract
    } = {}
  ) {
    const { withRelations = true, transaction = undefined } = options
    const query = Quote.query({ client: transaction })

    this.filterLength(query, input.minLength, '>=')
      .filterLength(query, input.maxLength, '<=')
      .filterAuthor(query, input.author)
      .filterTags(query, input.tags)
      .queryContent(query, input.query)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    const quotes = await query.orderByRaw('RAND()').limit(input.limit)

    return quotes.sort((a, b) => {
      let comparison = 0
      const first = a[input.sortBy]
      const second = b[input.sortBy]

      if (first instanceof DateTime && second instanceof DateTime) {
        comparison = first.toUnixInteger() - second.toUnixInteger()
      } else if (typeof first === 'string' && typeof second === 'string') {
        comparison = first.localeCompare(second)
      } else if (typeof first === 'number' && typeof second === 'number') {
        comparison = first - second
      }

      return input.order === OrderEnum.ASC ? comparison : -comparison
    })
  }

  async getById(
    id: number,
    options: {
      withRelations?: boolean
      findOrFail?: boolean
      transactions?: TransactionClientContract
    } = {}
  ) {
    const { withRelations = true, findOrFail = true, transactions = undefined } = options
    const query = Quote.query({ client: transactions }).where('id', id)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    return findOrFail ? await query.firstOrFail() : await query.first()
  }

  async getByIds(
    ids: number[],
    options: {
      withRelations?: boolean
      transaction?: TransactionClientContract
    } = {}
  ) {
    const { withRelations = true, transaction = undefined } = options
    const query = Quote.query({ client: transaction }).whereIn('id', ids)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    return await query
  }

  async getByContents(
    contents: string[],
    options: { withRelations?: boolean; transaction?: TransactionClientContract } = {}
  ) {
    const { withRelations = true, transaction = undefined } = options
    const query = Quote.query({ client: transaction }).whereIn('content', contents)

    if (withRelations) {
      query.withScopes((s) => s.queryBasicRelationships())
    }

    return await query.exec()
  }

  async create(input: NewQuoteSchema, options: { transaction?: TransactionClientContract } = {}) {
    return await Quote.create(input, { client: options.transaction })
  }

  async update(
    id: number,
    input: Partial<UpdateQuoteRequest>,
    options: { transaction?: TransactionClientContract } = {}
  ) {
    const quote = await this.getById(id, { transactions: options.transaction })

    quote
      ?.merge({
        content: input.content ?? quote.content,
      })
      ?.save()

    return quote as Quote
  }

  async createMultiple(
    input: NewQuoteSchema[],
    options: { transaction?: TransactionClientContract } = {}
  ) {
    if (options.transaction) {
      await options.transaction.insertQuery().table(Quote.table).multiInsert(input)
    } else {
      await db.table(Quote.table).multiInsert(input)
    }

    return await Quote.query({ client: options.transaction }).whereIn(
      'content',
      input.map((q) => q.content)
    )
  }

  async delete(id: number, options: { transaction?: TransactionClientContract } = {}) {
    const quote = await this.getById(id, { transactions: options.transaction })

    await quote?.delete()

    return quote as Quote
  }

  private filterLength(
    query: ModelQueryBuilderContract<typeof Quote, Quote>,
    length: number | undefined | null,
    direction: '>=' | '<='
  ) {
    if (length !== undefined && length !== null) {
      query.where(db.raw(`LENGTH(content) ${direction} ${length}`))
    }

    return this
  }

  private filterAuthor(
    query: ModelQueryBuilderContract<typeof Quote, Quote>,
    author: string | undefined | null
  ) {
    if (author !== undefined && author !== null) {
      query.whereHas('author', (builder) => builder.where('name', author).orWhere('slug', author))
    }

    return this
  }

  private filterTags(
    query: ModelQueryBuilderContract<typeof Quote, Quote>,
    tags: string | undefined | null
  ) {
    if (tags === undefined || tags === null) {
      return this
    }

    if (tags.includes('|')) {
      const tagsList: string[] = tags.split('|')

      query.whereHas('tags', (builder) => {
        tagsList.forEach((tag: string) => builder.orWhere('name', tag))
      })
    } else {
      const tagsList: string[] = tags.split(',')

      tagsList.forEach((tag: string) =>
        query.whereHas('tags', (builder) => builder.where('name', tag))
      )
    }

    return this
  }

  private queryContent(
    query: ModelQueryBuilderContract<typeof Quote, Quote>,
    search: string | undefined | null
  ) {
    if (search === undefined || search === null) {
      return this
    }

    const keywords = search
      .split(/[\s,;]+/)
      .map((w) => w + '*')
      .join(',')

    query.whereRaw(`MATCH (content) AGAINST('${keywords}' IN BOOLEAN MODE)`)
  }
}
