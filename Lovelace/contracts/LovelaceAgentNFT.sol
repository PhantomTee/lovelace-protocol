// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title LovelaceAgentNFT
 * @notice ERC-8004 compliant soulbound AI agent identity NFT for the Lovelace protocol.
 *         Minted automatically when an agent registers on the Lovelace registry.
 *         Non-transferable (soulbound) — represents the agent's on-chain identity and reputation.
 *         Reputation stats are updated live from the Lovelace registry via tokenURI.
 */
interface ILovelaceRegistry {
    struct AgentProfile {
        address owner;
        string name;
        string description;
        uint16 capabilities;
        uint256 priceWei;
        bool isActive;
        uint256 ratingSum;
        uint32 ratingCount;
        uint32 jobsCompleted;
        uint256 createdAt;
        uint256 jobNonce;
        uint256 stakeAmount;
        bool exists;
    }
    function getAgent(address owner) external view returns (AgentProfile memory);
}

contract LovelaceAgentNFT is ERC721 {
    using Strings for uint256;

    address public immutable registry;
    uint256 private _tokenIdCounter;

    mapping(address => uint256) public agentTokenId;
    mapping(uint256 => address) public tokenAgent;
    mapping(uint256 => uint256) public mintedAt;

    event AgentIdentityMinted(address indexed agent, uint256 indexed tokenId);

    error OnlyRegistry();
    error AlreadyHasIdentity();
    error Soulbound();

    constructor(address _registry) ERC721("Lovelace Agent Identity", "LAID") {
        registry = _registry;
    }

    // ─── Mint (called by Lovelace registry on registerAgent) ───────────────────

    function mint(address agent) external {
        if (msg.sender != registry) revert OnlyRegistry();
        if (agentTokenId[agent] != 0) revert AlreadyHasIdentity();

        uint256 id = ++_tokenIdCounter;
        _mint(agent, id);
        agentTokenId[agent] = id;
        tokenAgent[id] = agent;
        mintedAt[id] = block.timestamp;

        emit AgentIdentityMinted(agent, id);
    }

    // ─── Soulbound: block all transfers ────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ─── On-chain metadata (live reputation from registry) ─────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Nonexistent token");
        address agentAddr = tokenAgent[tokenId];

        ILovelaceRegistry.AgentProfile memory a = ILovelaceRegistry(registry).getAgent(agentAddr);

        string memory ratingStr = a.ratingCount > 0
            ? string(abi.encodePacked(
                _formatRating(a.ratingSum, a.ratingCount), "/5 (",
                uint256(a.ratingCount).toString(), " reviews)"
              ))
            : "Unrated";

        string memory capsStr = _decodeCaps(a.capabilities);
        string memory stakeStr = _formatEther(a.stakeAmount);
        string memory priceStr = _formatEther(a.priceWei);

        bytes memory attrs = abi.encodePacked(
            '[{"trait_type":"Name","value":"',          a.name,                                     '"},',
            '{"trait_type":"Status","value":"',         a.isActive ? "Active" : "Inactive",         '"},',
            '{"trait_type":"Jobs Completed","value":',  uint256(a.jobsCompleted).toString(),         '},',
            '{"trait_type":"Rating","value":"',         ratingStr,                                  '"},',
            '{"trait_type":"Capabilities","value":"',   capsStr,                                    '"},',
            '{"trait_type":"Stake (MNT)","value":"',    stakeStr,                                   '"},',
            '{"trait_type":"Price (MNT)","value":"',    priceStr,                                   '"},',
            '{"trait_type":"Network","value":"Mantle Sepolia"},',
            '{"trait_type":"Protocol","value":"Lovelace"},',
            '{"trait_type":"Standard","value":"ERC-8004"}]'
        );

        bytes memory json = abi.encodePacked(
            '{"name":"',        a.name, ' Identity #', tokenId.toString(), '",',
            '"description":"ERC-8004 AI Agent Identity - ', a.description, ' | Lovelace Protocol on Mantle Network",',
            '"image":"',        _buildSVG(a.name, a.isActive, a.jobsCompleted, ratingStr), '",',
            '"attributes":',    attrs,
            '}'
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    // ─── SVG badge ─────────────────────────────────────────────────────────────

    function _buildSVG(
        string memory name,
        bool isActive,
        uint32 jobsCompleted,
        string memory rating
    ) internal pure returns (string memory) {
        string memory statusColor = isActive ? "#10b981" : "#6b7280";
        string memory statusText  = isActive ? "ACTIVE" : "INACTIVE";

        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" style="stop-color:#0a0a0f"/><stop offset="100%" style="stop-color:#1a1a2e"/>',
            '</linearGradient></defs>',
            '<rect width="400" height="400" fill="url(#bg)"/>',
            '<rect x="1" y="1" width="398" height="398" rx="20" fill="none" stroke="#7c3aed" stroke-width="2"/>',
            '<text x="200" y="80" font-family="monospace" font-size="11" fill="#7c3aed" text-anchor="middle" letter-spacing="4">LOVELACE PROTOCOL</text>',
            '<text x="200" y="130" font-family="monospace" font-size="11" fill="#555570" text-anchor="middle">ERC-8004 AGENT IDENTITY</text>',
            '<text x="200" y="200" font-family="monospace" font-size="22" fill="#f0f0f8" text-anchor="middle" font-weight="bold">', name, '</text>',
            '<rect x="140" y="220" width="120" height="28" rx="14" fill="', statusColor, '22" stroke="', statusColor, '" stroke-width="1"/>',
            '<text x="200" y="239" font-family="monospace" font-size="11" fill="', statusColor, '" text-anchor="middle">', statusText, '</text>',
            '<text x="130" y="300" font-family="monospace" font-size="12" fill="#8888aa" text-anchor="middle">JOBS</text>',
            '<text x="130" y="322" font-family="monospace" font-size="20" fill="#f0f0f8" text-anchor="middle" font-weight="bold">', uint256(jobsCompleted).toString(), '</text>',
            '<text x="270" y="300" font-family="monospace" font-size="12" fill="#8888aa" text-anchor="middle">RATING</text>',
            '<text x="270" y="322" font-family="monospace" font-size="14" fill="#f0f0f8" text-anchor="middle">', rating, '</text>',
            '<text x="200" y="375" font-family="monospace" font-size="10" fill="#555570" text-anchor="middle">MANTLE NETWORK</text>',
            '</svg>'
        );

        return string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(svg)));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function _decodeCaps(uint16 caps) internal pure returns (string memory) {
        string[8] memory names = ["General","Code Review","Security Audit","Data Analysis","Translation","Research","Writing","Design"];
        uint16[8] memory bits  = [uint16(1), 2, 4, 8, 16, 32, 64, 128];
        bytes memory result;
        bool first = true;
        for (uint i = 0; i < 8; i++) {
            if (caps & bits[i] != 0) {
                if (!first) result = abi.encodePacked(result, ", ");
                result = abi.encodePacked(result, names[i]);
                first = false;
            }
        }
        return result.length > 0 ? string(result) : "None";
    }

    function _formatEther(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1e18;
        uint256 frac  = (wei_ % 1e18) / 1e14; // 4 decimal places
        if (frac == 0) return whole.toString();
        string memory fracStr = frac.toString();
        // pad to 4 digits
        while (bytes(fracStr).length < 4) fracStr = string(abi.encodePacked("0", fracStr));
        // trim trailing zeros
        bytes memory fb = bytes(fracStr);
        uint256 end = fb.length;
        while (end > 1 && fb[end - 1] == "0") end--;
        bytes memory trimmed = new bytes(end);
        for (uint i = 0; i < end; i++) trimmed[i] = fb[i];
        return string(abi.encodePacked(whole.toString(), ".", string(trimmed)));
    }

    function _formatRating(uint256 sum, uint32 count) internal pure returns (string memory) {
        if (count == 0) return "0";
        uint256 avg  = sum / count;
        uint256 frac = ((sum * 10) / count) % 10;
        return string(abi.encodePacked(avg.toString(), ".", frac.toString()));
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
