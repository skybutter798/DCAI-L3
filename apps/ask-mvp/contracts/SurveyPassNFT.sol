// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract SurveyPassNFT is ERC721Enumerable, Ownable {
    uint256 public constant MINT_PRICE = 1 ether; // 1 tDCAI on chain with 18 decimals
    uint256 public nextTokenId = 1;
    address public treasury;
    string private baseTokenURI;

    event SurveyPassMinted(
        address indexed to,
        uint256 indexed tokenId,
        uint256 indexed surveyId,
        uint256 paidAmount
    );

    constructor(address treasury_, string memory baseUri_)
        ERC721("DCAI Survey Pass", "ASK")
        Ownable(msg.sender)
    {
        require(treasury_ != address(0), "treasury required");
        treasury = treasury_;
        baseTokenURI = baseUri_;
    }

    function mintSurveyPass(uint256 surveyId) external payable returns (uint256 tokenId) {
        require(msg.value == MINT_PRICE, "price is 1 tDCAI");
        tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        emit SurveyPassMinted(msg.sender, tokenId, surveyId, msg.value);
        (bool ok, ) = treasury.call{value: msg.value}("");
        require(ok, "treasury transfer failed");
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury required");
        treasury = treasury_;
    }

    function setBaseURI(string calldata baseUri_) external onlyOwner {
        baseTokenURI = baseUri_;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
}
