import db from '@adonisjs/lucid/services/db'
import QuoteService from './quote_service.js'

export default class DeleteQuoteService extends QuoteService {
  async handle(id: number) {
    db.beginGlobalTransaction()

    try {
      const quote = await this.repository().delete(id)
      await quote.related('tags').detach()

      db.commitGlobalTransaction()

      return quote
    } catch (error) {
      db.rollbackGlobalTransaction()

      throw error
    }
  }
}
