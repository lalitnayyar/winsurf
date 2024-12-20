# Share Investment Ledger

A web-based application for tracking share investments with real-time price updates and portfolio management.

## Features

- Track share holdings with purchase details and real-time market prices
- Real-time price updates with visual indicators (green/red) for price movements
- Add new shares with validation (including date validation)
- Sell shares with proper tracking of profit/loss
- View historical transactions and performance
- Responsive design for desktop and mobile use

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Access the application at `http://localhost:3000`

## Usage

### Adding Shares
- Click "Add Share" button
- Enter symbol, quantity, purchase price, and date
- Purchase date cannot be in the future
- Add optional notes

### Selling Shares
- Click "Sell" button on any holding
- Enter quantity to sell and selling price
- Add optional notes
- System will calculate profit/loss automatically

### Viewing Holdings
- Active holdings shown in main table
- Real-time price updates with visual indicators
- Green up arrow for price increase
- Red down arrow for price decrease
- Total portfolio value and profit/loss shown at bottom

### Sold Shares
- View complete history of sold shares
- See profit/loss for each transaction
- Track performance over time

## Technical Details

- Built with Node.js and Express
- SQLite database for data storage
- Real-time price updates using web sockets
- Bootstrap 5 for responsive design
- Client-side validation for all forms
- Proper error handling and user feedback

## Security Features

- Input validation for all forms
- SQL injection protection
- XSS protection
- Proper error handling without exposing sensitive information

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - feel free to use and modify for your own purposes.
